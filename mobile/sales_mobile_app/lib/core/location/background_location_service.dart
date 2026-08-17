import 'dart:async';
import 'dart:io';

import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../../modules/field/repository/field_repository.dart';
import '../../modules/field/sync/field_sync_worker.dart';
import '../config/app_env.dart';
import '../local/field_local_store.dart';
import '../network/authed_dio.dart';
import '../storage/token_store.dart';
import 'field_sync_store.dart';

/// How often the background isolate drains the local queue to the backend.
/// The main-isolate [FieldSyncWorker] runs every 5 s while the app is in the
/// foreground; this is the safety net that keeps uploads flowing when the OS
/// has frozen the main isolate (app backgrounded / phone in pocket).
const _kBackgroundSyncInterval = Duration(seconds: 10);

const _kStop = 'stopService';

// Storage keys for visit-reminder position
const _kLastVisitNotifLat = 'last_visit_notif_lat';
const _kLastVisitNotifLng = 'last_visit_notif_lng';

// Notification IDs (must not conflict with foreground service ID 8801)
const _kNotifIdVisitReminder = 8803;

const _kVisitReminderDistanceM = 50000.0; // 50 km

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

// BackgroundLocationService captures GPS AND drives backend uploads from the
// background isolate. This isolate is hosted by the Android foreground service,
// so it keeps running when the OS freezes the main isolate (app backgrounded).
// It is therefore the only component that can keep the live map near real time
// while an agent's phone is in their pocket.
//
// The main-isolate FieldSyncWorker still runs while the app is foregrounded for
// snappier 5 s updates. Both drain the same SQLite queue; concurrent draining
// is safe because point claiming uses lease stamping (P0-2) and the backend
// dedupes by clientPointId — at worst a point is uploaded twice and the second
// upload is acked as a duplicate.
@pragma('vm:entry-point')
void _onStart(ServiceInstance service) async {
  const storage = FlutterSecureStorage();
  final notifier = _LocalNotifier();
  await notifier.init();

  final permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    await service.stopSelf();
    return;
  }

  final deviceId = await _getOrCreateDeviceId(storage);
  final clientShiftId =
      await storage.read(key: FieldSyncStore.activeClientShiftIdKey);
  if (clientShiftId == null || clientShiftId.isEmpty) {
    await service.stopSelf();
    return;
  }

  final store = await FieldLocalStore.open();
  final activeShift = await store.getActiveShift();
  final serverShiftId = activeShift?.serverShiftId;

  // Build an authenticated sync worker for this isolate. AppConfig is compiled
  // in via --dart-define so it is available without Riverpod; the token store
  // is backed by the platform keystore and is safe to read across isolates.
  final platform =
      Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'unknown');
  FieldSyncWorker? worker;
  Timer? syncTimer;
  try {
    final dio = buildAuthedDio(
      config: AppConfig.fromDartDefine(),
      tokenStore: TokenStore(storage),
    );
    worker = FieldSyncWorker(
      store: store,
      repository: FieldRepository(dio),
      deviceId: deviceId,
      platform: platform,
      workerName: 'background',
    );
    // Periodic safety-net drain. syncNow() honours its own backoff window so a
    // dead network doesn't cause a tight retry loop.
    syncTimer = Timer.periodic(
      _kBackgroundSyncInterval,
      (_) => worker?.syncNow(),
    );
    unawaited(worker.syncNow());
  } catch (_) {
    // Upload setup failed (e.g. no config) — keep capturing; points will be
    // drained by the foreground worker when the app next opens.
  }

  var persistChain = Future<void>.value();

  final positionSubscription = Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    ),
  ).listen((pos) {
    persistChain = persistChain.then((_) async {
      final now = DateTime.now().toUtc().toIso8601String();
      await store.insertPoint(LocalLocationPoint(
        clientPointId: FieldSyncStore.newClientPointId(deviceId),
        clientShiftId: clientShiftId,
        serverShiftId: serverShiftId,
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        recordedAt: pos.timestamp.toUtc().toIso8601String(),
        capturedAt: now,
        source: 'background_service',
        altitude: pos.altitude,
        speed: pos.speed,
        heading: pos.heading,
        isMocked: pos.isMocked ? 1 : 0,
        syncStatus: PointSyncStatus.pending,
        createdAt: now,
        updatedAt: now,
      ));
      await _checkVisitReminder(storage, notifier, pos.latitude, pos.longitude);
      // Push the freshly captured point as soon as possible. Guarded by the
      // worker's in-flight + backoff state, so this is cheap when offline.
      unawaited(worker?.syncNow() ?? Future<void>.value());
    });
  });

  service.on(_kStop).listen((_) async {
    syncTimer?.cancel();
    await positionSubscription.cancel();
    await service.stopSelf();
  });
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
