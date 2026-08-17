import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../local/field_local_store.dart';
import 'field_sync_store.dart';

/// Owns in-process (main isolate) GPS capture.
///
/// Responsibilities:
/// - Subscribe to the Geolocator position stream.
/// - Construct [LocalLocationPoint] models and persist them via [FieldLocalStore].
/// - Make NO network calls — backend sync is handled by [FieldSyncWorker].
class LocationCaptureService {
  LocationCaptureService({
    required FieldLocalStore store,
    required String deviceId,
  })  : _store = store,
        _deviceId = deviceId;

  final FieldLocalStore _store;
  final String _deviceId;

  String? _clientShiftId;
  String? _serverShiftId;
  StreamSubscription<Position>? _positionSub;
  bool _isStarting = false;

  bool get isRunning => _positionSub != null;

  /// Begin capturing GPS for a shift.
  ///
  /// [clientShiftId] must be non-empty. [serverShiftId] may be null when the
  /// shift is still in `local_active` state — it will be set later via
  /// [updateServerShiftId].
  ///
  /// If already running, this call is a no-op (duplicate-start guard).
  /// If location permission is denied, returns immediately without starting.
  Future<void> start(String clientShiftId, {String? serverShiftId}) async {
    // Synchronous guard: prevent concurrent start() calls racing through the awaits.
    if (_isStarting || isRunning) {
      debugPrint(
        '[LocationCaptureService] start() ignored — '
        '${isRunning ? "already running" : "start in progress"} for '
        '$_clientShiftId',
      );
      return;
    }
    _isStarting = true;

    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        debugPrint(
          '[LocationCaptureService] start() aborted — location permission '
          'denied ($permission)',
        );
        return;
      }

      _clientShiftId = clientShiftId;
      _serverShiftId = serverShiftId;

      _positionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10,
        ),
      ).listen(
        _onPosition,
        onError: (Object err, StackTrace st) {
          debugPrint('[LocationCaptureService] position stream error: $err\n$st');
        },
      );

      debugPrint(
        '[LocationCaptureService] started for clientShiftId=$clientShiftId '
        'serverShiftId=$serverShiftId',
      );
    } finally {
      _isStarting = false;
    }
  }

  /// Stop capturing GPS (on shift end or permission loss).
  Future<void> stop() async {
    await _positionSub?.cancel();
    _positionSub = null;
    _clientShiftId = null;
    _serverShiftId = null;
    debugPrint('[LocationCaptureService] stopped');
  }

  /// Update the [serverShiftId] used for future points.
  ///
  /// Call this when [FieldSyncWorker] receives the server-side shift ID from
  /// a `syncStart` acknowledgement. Already-captured points are not modified.
  void updateServerShiftId(String serverShiftId) {
    _serverShiftId = serverShiftId;
    debugPrint(
      '[LocationCaptureService] serverShiftId updated to $serverShiftId',
    );
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  void _onPosition(Position pos) {
    final shiftId = _clientShiftId;
    if (shiftId == null) return;

    final now = DateTime.now().toUtc().toIso8601String();
    final point = LocalLocationPoint(
      clientPointId: FieldSyncStore.newClientPointId(_deviceId),
      clientShiftId: shiftId,
      serverShiftId: _serverShiftId,
      lat: pos.latitude,
      lng: pos.longitude,
      accuracy: pos.accuracy,
      recordedAt: pos.timestamp.toUtc().toIso8601String(),
      capturedAt: now,
      source: 'location_capture_service',
      altitude: pos.altitude,
      speed: pos.speed,
      heading: pos.heading,
      isMocked: pos.isMocked ? 1 : 0,
      syncStatus: PointSyncStatus.pending,
      createdAt: now,
      updatedAt: now,
    );

    // Fire-and-forget insert — errors are logged but must not crash the stream.
    _store.insertPoint(point).catchError((Object err, StackTrace st) {
      debugPrint(
        '[LocationCaptureService] insertPoint error: $err\n$st',
      );
    });
  }
}
