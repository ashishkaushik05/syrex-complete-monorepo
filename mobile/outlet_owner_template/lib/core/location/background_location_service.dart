import 'dart:async';

import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';

import '../config/app_env.dart';
import '../db/field_local_store.dart';
import '../db/local_models.dart';

// ── message keys sent between main isolate and background service ────────────

const _kStopService = 'stopService';
const _kSyncToken = 'syncToken';
const _kTokenKey = 'token';
const _kClientShiftId = 'clientShiftId';

// ── configure & lifecycle (call from main isolate) ───────────────────────────

class BackgroundLocationService {
  static final _service = FlutterBackgroundService();

  /// Must be called once during app startup.
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

  static Future<void> start({String? clientShiftId}) async {
    if (!await _service.isRunning()) {
      await _service.startService();
    }
    if (clientShiftId != null) {
      _service.invoke(_kClientShiftId, {_kTokenKey: clientShiftId});
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

// ── iOS background handler ───────────────────────────────────────────────────

@pragma('vm:entry-point')
Future<bool> _onIosBackground(ServiceInstance service) async {
  return true;
}

// ── background isolate entry point ───────────────────────────────────────────
// Points are persisted directly to SQLite — no in-memory buffer.
// Network upload is NOT done here; FieldSyncWorker on the main isolate handles sync.

@pragma('vm:entry-point')
void _onStart(ServiceInstance service) async {
  AppConfig.fromDartDefine(); // ensure compile-time constants are evaluated.

  const storage = FlutterSecureStorage();
  String? clientShiftId = await storage.read(key: 'active_client_shift_id');

  // Listen for stop signal.
  service.on(_kStopService).listen((_) async {
    await service.stopSelf();
  });

  // Listen for clientShiftId update from main isolate.
  service.on(_kClientShiftId).listen((event) {
    if (event == null) return;
    final id = event[_kTokenKey] as String?;
    if (id != null && id.isNotEmpty) clientShiftId = id;
  });

  // Token sync is kept for compatibility but upload no longer happens here.
  service.on(_kSyncToken).listen((_) {});

  final permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    await service.stopSelf();
    return;
  }

  const uuid = Uuid();

  Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    ),
  ).listen(
    (position) async {
      final shiftId = clientShiftId;
      if (shiftId == null || shiftId.isEmpty) return;

      final now = DateTime.now().toUtc().toIso8601String();
      final point = LocalLocationPoint(
        clientPointId: uuid.v4(),
        clientShiftId: shiftId,
        lat: position.latitude,
        lng: position.longitude,
        accuracy: position.accuracy,
        recordedAt: position.timestamp.toUtc().toIso8601String(),
        capturedAt: now,
        source: 'background',
        altitude: position.altitude,
        speed: position.speed >= 0 ? position.speed : null,
        heading: position.heading >= 0 ? position.heading : null,
        isMocked: position.isMocked,
        syncStatus: SyncStatus.pending,
        syncAttempts: 0,
        createdAt: now,
        updatedAt: now,
      );

      await FieldLocalStore.instance.insertLocationPoint(point);
    },
    onError: (_) {},
    cancelOnError: false,
  );
}
