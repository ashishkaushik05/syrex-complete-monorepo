import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';

import '../db/field_local_store.dart';
import '../db/local_models.dart';

// ── LocationCaptureService ────────────────────────────────────────────────────
// Subscribes to the Geolocator stream and persists every point immediately to
// SQLite. Network is never touched here — sync is FieldSyncWorker's job.

class LocationCaptureService {
  LocationCaptureService._();
  static final LocationCaptureService instance = LocationCaptureService._();

  static const _uuid = Uuid();

  String? _activeClientShiftId;
  bool _running = false;

  bool get isRunning => _running;
  String? get activeClientShiftId => _activeClientShiftId;

  Future<void> start({
    required String clientShiftId,
    String source = 'foreground',
  }) async {
    if (_running) return;
    _running = true;
    _activeClientShiftId = clientShiftId;
    _streamPoints(clientShiftId: clientShiftId, source: source);
  }

  void stop() {
    _running = false;
    _activeClientShiftId = null;
  }

  void _streamPoints({
    required String clientShiftId,
    required String source,
  }) {
    final stream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    );

    stream.listen(
      (position) async {
        if (!_running || _activeClientShiftId != clientShiftId) return;
        final now = DateTime.now().toUtc().toIso8601String();
        final point = LocalLocationPoint(
          clientPointId: _uuid.v4(),
          clientShiftId: clientShiftId,
          lat: position.latitude,
          lng: position.longitude,
          accuracy: position.accuracy,
          recordedAt: position.timestamp.toUtc().toIso8601String(),
          capturedAt: now,
          source: source,
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
      onError: (_) {
        // GPS errors are non-fatal; keep running.
      },
      cancelOnError: false,
    );
  }
}
