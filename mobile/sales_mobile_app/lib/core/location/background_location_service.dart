import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../config/app_env.dart';
import 'field_sync_store.dart';

const _kStop = 'stopService';

// Storage keys for alert state
const _kServerUnreachableSince = 'server_unreachable_since';
const _kLastVisitNotifLat = 'last_visit_notif_lat';
const _kLastVisitNotifLng = 'last_visit_notif_lng';

// Notification IDs (must not conflict with foreground service ID 8801)
const _kNotifIdServerUnreachable = 8802;
const _kNotifIdVisitReminder = 8803;

const _kVisitReminderDistanceM = 50000.0; // 50 km
const _kServerUnreachableThreshold = Duration(hours: 1);

class BackgroundLocationService {
  static final _service = FlutterBackgroundService();
  static bool _configured = false;

  static Future<void> configure() async {
    if (_configured) return;
    await _service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _onStart,
        isForegroundMode: true,
        notificationChannelId: 'syrex_field_location',
        initialNotificationTitle: 'Field Sense',
        initialNotificationContent: 'Tracking your location…',
        foregroundServiceNotificationId: 8801,
        foregroundServiceTypes: [AndroidForegroundType.location],
        autoStart: false,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: _onStart,
        onBackground: _onIosBackground,
      ),
    );
    _configured = true;
  }

  static Future<bool> get isRunning => _service.isRunning();

  static Future<void> start() async {
    if (!_configured) await configure();
    if (!await _service.isRunning()) await _service.startService();
  }

  static Future<void> stop() async {
    _service.invoke(_kStop);
  }
}

@pragma('vm:entry-point')
Future<bool> _onIosBackground(ServiceInstance service) async => true;

@pragma('vm:entry-point')
void _onStart(ServiceInstance service) async {
  final config = AppConfig.fromDartDefine();
  final headers = <String, dynamic>{'ngrok-skip-browser-warning': '1'};
  if (config.orgId != null && config.orgId!.isNotEmpty) {
    headers['x-org-id'] = config.orgId;
  }
  const storage = FlutterSecureStorage();

  final notifier = _LocalNotifier();
  await notifier.init();

  final dio = Dio(
    BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: headers,
    ),
  );

  final permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    await service.stopSelf();
    return;
  }

  final deviceId = await _getOrCreateDeviceId(storage);
  final clientShiftId =
      await storage.read(key: FieldSyncStore.activeClientShiftIdKey);
  final serverShiftId =
      await storage.read(key: FieldSyncStore.activeServerShiftIdKey);
  if (clientShiftId == null ||
      clientShiftId.isEmpty ||
      serverShiftId == null ||
      serverShiftId.isEmpty) {
    await service.stopSelf();
    return;
  }

  var persistChain = Future<void>.value();

  final positionSubscription = Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    ),
  ).listen((pos) {
    final point = {
      'clientPointId': FieldSyncStore.newClientPointId(deviceId),
      'lat': pos.latitude,
      'lng': pos.longitude,
      'accuracy': pos.accuracy,
      'recordedAt': pos.timestamp.toUtc().toIso8601String(),
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
      'source': 'foreground_service',
      'platform': Platform.isIOS ? 'ios' : 'android',
    };
    persistChain = persistChain.then((_) async {
      await _appendPendingPoint(storage, point);
      await _checkVisitReminder(storage, notifier, pos.latitude, pos.longitude);
    });
  });

  int consecutiveBadShift = 0;
  final flushTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
    await persistChain;
    final pending = await FieldSyncStore.readPendingPointsFrom(storage);
    if (pending.isEmpty) return;

    final token = await storage.read(key: 'access_token') ?? '';
    if (token.isEmpty) return;
    dio.options.headers['Authorization'] = 'Bearer $token';

    const maxBatch = 500;
    var queue = pending;
    while (queue.isNotEmpty) {
      final end = queue.length < maxBatch ? queue.length : maxBatch;
      final batch = List<Map<String, dynamic>>.from(queue.sublist(0, end));

      try {
        final response = await dio.post(
          '/fieldLocation.ingestV2',
          data: jsonEncode({
            'json': {
              'clientShiftId': clientShiftId,
              'shiftId': serverShiftId,
              'deviceId': deviceId,
              'points': batch,
            }
          }),
          options: Options(headers: {'Content-Type': 'application/json'}),
        );
        // Successful response — server is reachable; clear unreachable marker.
        await _clearServerUnreachable(storage);

        final ack = _extractMap(response.data);
        if (ack['retryable'] == true) {
          consecutiveBadShift++;
          if (consecutiveBadShift >= 3) {
            await service.stopSelf();
            return;
          }
          break;
        }
        final removable = _removablePointIds(ack);
        queue = queue
            .where((point) => !removable.contains(point['clientPointId']))
            .toList();
        await FieldSyncStore.writePendingPointsTo(storage, queue);
        await _reportSyncStatus(
          dio,
          deviceId: deviceId,
          clientShiftId: clientShiftId,
          serverShiftId: serverShiftId,
          pendingQueueDepth: queue.length,
          lastCapturedAt: _newestCapturedAt(batch),
        );
        consecutiveBadShift = 0;
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) {
          await _reportSyncStatus(
            dio,
            deviceId: deviceId,
            clientShiftId: clientShiftId,
            serverShiftId: serverShiftId,
            pendingQueueDepth: pending.length,
            lastSyncErrorCode: 'UNAUTHORIZED',
          );
          await service.stopSelf();
          return;
        }
        if (e.response?.statusCode == 400 || e.response?.statusCode == 404) {
          consecutiveBadShift++;
          if (consecutiveBadShift >= 3) {
            await service.stopSelf();
            return;
          }
        }
        // Network error or 5xx: track unreachability and maybe notify.
        final isNetworkError = e.response == null;
        final is5xx = (e.response?.statusCode ?? 0) >= 500;
        if (isNetworkError || is5xx) {
          await _reportSyncStatus(
            dio,
            deviceId: deviceId,
            clientShiftId: clientShiftId,
            serverShiftId: serverShiftId,
            pendingQueueDepth: pending.length,
            lastSyncErrorCode:
                isNetworkError ? 'NETWORK_ERROR' : 'SERVER_ERROR',
          );
          await _handleServerUnreachable(storage, notifier);
        }
        break;
      } catch (_) {
        await _reportSyncStatus(
          dio,
          deviceId: deviceId,
          clientShiftId: clientShiftId,
          serverShiftId: serverShiftId,
          pendingQueueDepth: pending.length,
          lastSyncErrorCode: 'SYNC_ERROR',
        );
        await _handleServerUnreachable(storage, notifier);
        break;
      }
    }
  });

  service.on(_kStop).listen((_) async {
    flushTimer.cancel();
    await positionSubscription.cancel();
    await service.stopSelf();
  });
}

// ─── Server-unreachable tracking ─────────────────────────────────────────────

Future<void> _handleServerUnreachable(
  FlutterSecureStorage storage,
  _LocalNotifier notifier,
) async {
  final raw = await storage.read(key: _kServerUnreachableSince);
  if (raw == null) {
    // First failure — record when connectivity dropped.
    await storage.write(
      key: _kServerUnreachableSince,
      value: DateTime.now().toUtc().toIso8601String(),
    );
    return;
  }

  final since = DateTime.tryParse(raw);
  if (since == null) return;
  if (DateTime.now().toUtc().difference(since) >=
      _kServerUnreachableThreshold) {
    await notifier.show(
      id: _kNotifIdServerUnreachable,
      title: 'Field Sense: Server Unreachable',
      body: 'Cannot reach the server for over 1 hour. '
          'Check your connection — location data is queued locally.',
    );
    // Reset the clock so the next notification fires only after another hour.
    await storage.write(
      key: _kServerUnreachableSince,
      value: DateTime.now().toUtc().toIso8601String(),
    );
  }
}

Future<void> _clearServerUnreachable(FlutterSecureStorage storage) async {
  await storage.delete(key: _kServerUnreachableSince);
}

Future<void> _reportSyncStatus(
  Dio dio, {
  required String deviceId,
  required String clientShiftId,
  required String serverShiftId,
  required int pendingQueueDepth,
  String? lastCapturedAt,
  String? lastSyncErrorCode,
}) async {
  try {
    await dio.post(
      '/fieldSyncStatus.upsert',
      data: jsonEncode({
        'json': {
          'deviceId': deviceId,
          'clientShiftId': clientShiftId,
          'shiftId': serverShiftId,
          'platform': Platform.isIOS ? 'ios' : 'android',
          if (lastCapturedAt != null) 'lastCapturedAt': lastCapturedAt,
          'lastSyncAttemptAt': DateTime.now().toUtc().toIso8601String(),
          'lastSyncErrorCode': lastSyncErrorCode,
          'pendingQueueDepth': pendingQueueDepth,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
  } catch (_) {
    // Health reporting must not block location delivery.
  }
}

String? _newestCapturedAt(List<Map<String, dynamic>> points) {
  DateTime? newest;
  for (final point in points) {
    final raw = point['capturedAt'] ?? point['recordedAt'];
    final parsed = raw is String ? DateTime.tryParse(raw) : null;
    if (parsed != null && (newest == null || parsed.isAfter(newest))) {
      newest = parsed;
    }
  }
  return newest?.toUtc().toIso8601String();
}

// ─── 50 km visit-reminder tracking ───────────────────────────────────────────

Future<void> _checkVisitReminder(
  FlutterSecureStorage storage,
  _LocalNotifier notifier,
  double lat,
  double lng,
) async {
  final rawLat = await storage.read(key: _kLastVisitNotifLat);
  final rawLng = await storage.read(key: _kLastVisitNotifLng);

  if (rawLat == null || rawLng == null) {
    // First position — store as baseline without firing.
    await _saveVisitNotifPosition(storage, lat, lng);
    return;
  }

  final baseLat = double.tryParse(rawLat);
  final baseLng = double.tryParse(rawLng);
  if (baseLat == null || baseLng == null) {
    await _saveVisitNotifPosition(storage, lat, lng);
    return;
  }

  final distanceM = Geolocator.distanceBetween(baseLat, baseLng, lat, lng);
  if (distanceM >= _kVisitReminderDistanceM) {
    await notifier.show(
      id: _kNotifIdVisitReminder,
      title: 'Record a Visit',
      body: "You've moved ${(distanceM / 1000).toStringAsFixed(0)} km. "
          'Tap to log your visit in Field Sense.',
    );
    await _saveVisitNotifPosition(storage, lat, lng);
  }
}

Future<void> _saveVisitNotifPosition(
  FlutterSecureStorage storage,
  double lat,
  double lng,
) async {
  await storage.write(key: _kLastVisitNotifLat, value: '$lat');
  await storage.write(key: _kLastVisitNotifLng, value: '$lng');
}

// ─── Notification helper ──────────────────────────────────────────────────────

class _LocalNotifier {
  final _plugin = FlutterLocalNotificationsPlugin();

  static const _androidDetails = AndroidNotificationDetails(
    'syrex_field_alerts',
    'Field Alerts',
    channelDescription: 'Important Field Sense alerts',
    importance: Importance.high,
    priority: Priority.high,
    icon: '@mipmap/ic_launcher',
  );

  static const _notifDetails = NotificationDetails(
    android: _androidDetails,
    iOS: DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    ),
  );

  Future<void> init() async {
    await _plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
    );
  }

  Future<void> show({
    required int id,
    required String title,
    required String body,
  }) async {
    await _plugin.show(id, title, body, _notifDetails);
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

Future<String> _getOrCreateDeviceId(FlutterSecureStorage storage) async {
  final existing = await storage.read(key: FieldSyncStore.deviceIdKey);
  if (existing != null && existing.isNotEmpty) return existing;
  final generated = FieldSyncStore.newClientShiftId('device');
  await storage.write(key: FieldSyncStore.deviceIdKey, value: generated);
  return generated;
}

Future<void> _appendPendingPoint(
  FlutterSecureStorage storage,
  Map<String, dynamic> point,
) async {
  final existing = await FieldSyncStore.readPendingPointsFrom(storage);
  await FieldSyncStore.writePendingPointsTo(storage, [...existing, point]);
}

Map<String, dynamic> _extractMap(dynamic raw) {
  if (raw is List && raw.isNotEmpty) {
    final first = raw.first;
    if (first is Map<String, dynamic>) {
      final data = first['result']?['data']?['json'];
      if (data is Map<String, dynamic>) return data;
    }
  }
  if (raw is Map<String, dynamic>) {
    final data = raw['result']?['data']?['json'];
    if (data is Map<String, dynamic>) return data;
  }
  return const <String, dynamic>{};
}

Set<String> _removablePointIds(Map<String, dynamic> ack) {
  final accepted = (ack['accepted'] as List<dynamic>? ?? const [])
      .map((value) => value.toString());
  final duplicates = (ack['duplicates'] as List<dynamic>? ?? const [])
      .map((value) => value.toString());
  final rejected = (ack['rejected'] as List<dynamic>? ?? const [])
      .whereType<Map>()
      .map((entry) => entry['clientPointId'].toString());
  return {...accepted, ...duplicates, ...rejected};
}
