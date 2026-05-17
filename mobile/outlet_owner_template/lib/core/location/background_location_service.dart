import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../config/app_env.dart';

// ── message keys sent between main isolate and background service ────────────

const _kStopService = 'stopService';
const _kSyncToken = 'syncToken';
const _kTokenKey = 'token';

// ── configure & lifecycle (call from main isolate) ───────────────────────────

class BackgroundLocationService {
  static final _service = FlutterBackgroundService();

  /// Must be called once during app startup before starting the service.
  static Future<void> configure() async {
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
  }

  static Future<bool> get isRunning async => _service.isRunning();

  static Future<void> start() async {
    if (!await _service.isRunning()) {
      await _service.startService();
    }
  }

  static Future<void> stop() async {
    _service.invoke(_kStopService);
  }

  /// Call after a token refresh so the background isolate uses the new token.
  static void syncToken(String accessToken) {
    _service.invoke(_kSyncToken, {_kTokenKey: accessToken});
  }
}

// ── iOS background handler (required by plugin) ──────────────────────────────

@pragma('vm:entry-point')
Future<bool> _onIosBackground(ServiceInstance service) async {
  return true;
}

// ── background isolate entry point ───────────────────────────────────────────

@pragma('vm:entry-point')
void _onStart(ServiceInstance service) async {
  // Obtain base URL from dart-define constants (evaluated at compile time,
  // so they are available in every isolate).
  final baseUrl = AppConfig.fromDartDefine().baseUrl; // e.g. …/trpc

  // Dedicated Dio — no Riverpod in background isolate.
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );

  // Read the access token from secure storage.
  const storage = FlutterSecureStorage();
  var accessToken = await storage.read(key: 'access_token') ?? '';

  void setAuthHeader() {
    if (accessToken.isNotEmpty) {
      dio.options.headers['Authorization'] = 'Bearer $accessToken';
    } else {
      dio.options.headers.remove('Authorization');
    }
  }

  setAuthHeader();

  // Listen for token refresh from main isolate.
  service.on(_kSyncToken).listen((event) {
    if (event == null) return;
    final token = event[_kTokenKey] as String? ?? '';
    if (token.isNotEmpty) {
      accessToken = token;
      setAuthHeader();
    }
  });

  // Listen for stop signal.
  service.on(_kStopService).listen((_) async {
    await service.stopSelf();
  });

  // Accumulated GPS points waiting to be flushed.
  final buffer = <Map<String, dynamic>>[];

  // ── GPS stream ────────────────────────────────────────────────────────────
  StreamSubscription<Position>? positionSub;

  LocationPermission permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    // Cannot track without permission — shut down gracefully.
    await service.stopSelf();
    return;
  }

  positionSub = Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10, // metres between updates
    ),
  ).listen((position) {
    buffer.add({
      'lat': position.latitude,
      'lng': position.longitude,
      'accuracy': position.accuracy,
      // Must be ISO-8601 datetime (zod .datetime() validation on backend)
      'recordedAt': position.timestamp.toUtc().toIso8601String(),
    });
  });

  // ── flush loop: every 10 seconds ─────────────────────────────────────────
  Timer.periodic(const Duration(seconds: 10), (_) async {
    if (buffer.isEmpty) return;

    // Drain the buffer (max 500 per call — backend hard limit).
    const maxBatch = 500;
    while (buffer.isNotEmpty) {
      final end = buffer.length < maxBatch ? buffer.length : maxBatch;
      final batch = List<Map<String, dynamic>>.from(buffer.sublist(0, end));
      buffer.removeRange(0, end);

      try {
        await dio.post(
          '/fieldLocation.ingest',
          data: jsonEncode({'json': {'locations': batch}}),
          options: Options(headers: {'Content-Type': 'application/json'}),
        );
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) {
          // Token expired and could not be refreshed — stop tracking.
          await positionSub?.cancel();
          await service.stopSelf();
          return;
        }
        // 400 (e.g. no active shift): drop the batch and keep running.
        // Network errors: points already removed — they are lost; acceptable.
      } catch (_) {
        // Unexpected error — keep running, batch already removed.
      }
    }
  });
}
