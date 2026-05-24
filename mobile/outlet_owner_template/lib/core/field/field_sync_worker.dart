import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../db/field_local_store.dart';
import '../db/local_models.dart';

// ── FieldSyncWorker ───────────────────────────────────────────────────────────
// Uploads local SQLite data to the backend V2 contracts.
// Runs on the main isolate (Riverpod-accessible). The background isolate's
// timer also calls _trySync() via the static interface.
//
// V2 endpoint sequence:
//   1. fieldShifts.syncStart  → gets serverShiftId
//   2. fieldLocation.ingestV2 → batch upload with clientPointId
//   3. fieldShifts.syncEnd    → when local shift endedAt is set
//
// Falls back to fieldLocation.ingest (V1) if V2 is not yet deployed.

class FieldSyncWorker {
  FieldSyncWorker(this._dio);

  final Dio _dio;
  bool _running = false;
  Timer? _retryTimer;
  int _consecutiveFailures = 0;

  static const _maxBatch = 200;
  static const _maxBackoffSeconds = 300;

  // ── public API ─────────────────────────────────────────────────────────────

  Future<void> runOnce() async {
    if (_running) return;
    _running = true;
    try {
      await _trySync();
    } finally {
      _running = false;
    }
  }

  void scheduleRetry() {
    _retryTimer?.cancel();
    final delay = _backoffDelay(_consecutiveFailures);
    _retryTimer = Timer(delay, runOnce);
  }

  void cancel() {
    _retryTimer?.cancel();
    _running = false;
  }

  // ── internal ───────────────────────────────────────────────────────────────

  Future<void> _trySync() async {
    final shift = await FieldLocalStore.instance.getActiveLocalShift();
    if (shift == null) return;

    // Reset any in-flight marks left over from a crash.
    await FieldLocalStore.instance.resetInFlightToPending(shift.clientShiftId);

    // 1. Sync shift start.
    if (!shift.isSynced) {
      final ok = await _syncStart(shift);
      if (!ok) {
        _consecutiveFailures++;
        scheduleRetry();
        return;
      }
    }

    // Re-read to get serverShiftId.
    final synced =
        await FieldLocalStore.instance.getShiftByClientId(shift.clientShiftId);
    if (synced == null) return;

    // 2. Upload pending location points in batches.
    await _uploadPoints(synced);

    // 3. Sync shift end if queued.
    if (synced.status == LocalShiftStatus.endingPending &&
        synced.endedAt != null) {
      await _syncEnd(synced);
    }

    _consecutiveFailures = 0;
  }

  Future<bool> _syncStart(LocalShift shift) async {
    await FieldLocalStore.instance.updateShiftStatus(
      clientShiftId: shift.clientShiftId,
      status: LocalShiftStatus.syncingStart,
    );

    try {
      final res = await _dio.post(
        '/fieldShifts.syncStart',
        data: jsonEncode({
          'json': {
            'clientShiftId': shift.clientShiftId,
            'startedAt': shift.startedAt,
            'platform': 'flutter',
          }
        }),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      final data = _extract(res.data);
      final serverShiftId =
          (data['serverShiftId'] ?? data['shift']?['id']) as String?;
      if (serverShiftId == null) throw Exception('no serverShiftId in response');

      await FieldLocalStore.instance.updateShiftAfterSyncStart(
        clientShiftId: shift.clientShiftId,
        serverShiftId: serverShiftId,
      );
      return true;
    } on DioException catch (e) {
      if (_isProcedureNotFound(e)) {
        // Backend V2 not deployed yet — fall back to V1 start.
        return _syncStartV1(shift);
      }
      if (_isAuthError(e)) {
        // Preserve queue; auth will be restored by token refresh.
        await FieldLocalStore.instance.updateShiftStatus(
          clientShiftId: shift.clientShiftId,
          status: LocalShiftStatus.localActive,
          lastErrorCode: 'AUTH_ERROR',
        );
        return false;
      }
      await FieldLocalStore.instance.updateShiftStatus(
        clientShiftId: shift.clientShiftId,
        status: LocalShiftStatus.localActive,
        lastErrorCode: e.response?.statusCode?.toString() ?? 'NETWORK_ERROR',
      );
      return false;
    }
  }

  Future<bool> _syncStartV1(LocalShift shift) async {
    try {
      final res = await _dio.post(
        '/fieldShifts.start',
        data: jsonEncode({'json': {}}),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      final data = _extract(res.data);
      final serverShiftId = data['id'] as String?;
      if (serverShiftId == null) return false;
      await FieldLocalStore.instance.updateShiftAfterSyncStart(
        clientShiftId: shift.clientShiftId,
        serverShiftId: serverShiftId,
      );
      return true;
    } catch (_) {
      await FieldLocalStore.instance.updateShiftStatus(
        clientShiftId: shift.clientShiftId,
        status: LocalShiftStatus.localActive,
        lastErrorCode: 'V1_START_FAILED',
      );
      return false;
    }
  }

  Future<void> _uploadPoints(LocalShift shift) async {
    while (true) {
      final batch = await FieldLocalStore.instance.getPendingPoints(
        clientShiftId: shift.clientShiftId,
        limit: _maxBatch,
      );
      if (batch.isEmpty) break;

      final ids = batch.map((p) => p.clientPointId).toList();
      await FieldLocalStore.instance.markPointsInFlight(ids);

      try {
        await _uploadBatch(shift: shift, batch: batch);
      } on DioException catch (e) {
        // On auth error: stop uploading but keep points as in_flight.
        // resetInFlightToPending will recover them on the next runOnce.
        if (_isAuthError(e)) {
          await FieldLocalStore.instance
              .resetInFlightToPending(shift.clientShiftId);
          _consecutiveFailures++;
          scheduleRetry();
          return;
        }
        // Network / server error: reset to pending and retry later.
        await FieldLocalStore.instance
            .resetInFlightToPending(shift.clientShiftId);
        _consecutiveFailures++;
        scheduleRetry();
        return;
      }
    }
  }

  Future<void> _uploadBatch({
    required LocalShift shift,
    required List<LocalLocationPoint> batch,
  }) async {
    // Try V2 first.
    try {
      final res = await _dio.post(
        '/fieldLocation.ingestV2',
        data: jsonEncode({
          'json': {
            'clientShiftId': shift.clientShiftId,
            if (shift.serverShiftId != null) 'shiftId': shift.serverShiftId,
            'platform': 'flutter',
            'points': batch.map((p) => p.toIngestJson()).toList(),
          }
        }),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      final data = _extract(res.data);
      final accepted =
          List<String>.from(data['accepted'] as List? ?? []);
      final duplicates =
          List<String>.from(data['duplicates'] as List? ?? []);
      final rejected =
          List<dynamic>.from(data['rejected'] as List? ?? []);

      await FieldLocalStore.instance.markPointsAcked([...accepted, ...duplicates]);
      for (final r in rejected) {
        final m = r as Map<String, dynamic>;
        await FieldLocalStore.instance.markPointsRejected(
          clientPointId: m['clientPointId'] as String,
          reason: m['reason'] as String? ?? 'REJECTED',
        );
      }
      return;
    } on DioException catch (e) {
      if (_isProcedureNotFound(e)) {
        // V2 not deployed — fall back to V1 ingest.
        await _uploadBatchV1(shift: shift, batch: batch);
        return;
      }
      rethrow;
    }
  }

  Future<void> _uploadBatchV1({
    required LocalShift shift,
    required List<LocalLocationPoint> batch,
  }) async {
    await _dio.post(
      '/fieldLocation.ingest',
      data: jsonEncode({
        'json': {
          'locations': batch
              .map((p) => {
                    'lat': p.lat,
                    'lng': p.lng,
                    'accuracy': p.accuracy,
                    'recordedAt': p.recordedAt,
                  })
              .toList(),
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    // V1 has no per-point ack; treat all as acked.
    await FieldLocalStore.instance
        .markPointsAcked(batch.map((p) => p.clientPointId).toList());
  }

  Future<void> _syncEnd(LocalShift shift) async {
    final endedAt = shift.endedAt;
    if (endedAt == null) {
      // Cannot sync end without a recorded endedAt — skip and let the next
      // sync attempt pick it up once the field is populated.
      debugPrint(
          '[SyncWorker] Cannot sync end: endedAt is null for shift ${shift.clientShiftId}');
      return;
    }

    try {
      await _dio.post(
        '/fieldShifts.syncEnd',
        data: jsonEncode({
          'json': {
            'clientShiftId': shift.clientShiftId,
            'endedAt': endedAt,
            'platform': 'flutter',
          }
        }),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      await FieldLocalStore.instance.completeShift(
        clientShiftId: shift.clientShiftId,
        endedAt: endedAt,
      );
    } on DioException catch (e) {
      if (_isProcedureNotFound(e)) {
        // V2 syncEnd not deployed — call V1 end.
        try {
          await _dio.post(
            '/fieldShifts.end',
            data: jsonEncode({'json': {}}),
            options: Options(headers: {'Content-Type': 'application/json'}),
          );
          await FieldLocalStore.instance.completeShift(
            clientShiftId: shift.clientShiftId,
            endedAt: endedAt,
          );
        } catch (_) {
          _consecutiveFailures++;
          scheduleRetry();
        }
        return;
      }
      _consecutiveFailures++;
      scheduleRetry();
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  Map<String, dynamic> _extract(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) {
        return (first['result']?['data']?['json'] ?? <String, dynamic>{})
            as Map<String, dynamic>;
      }
    }
    if (raw is Map<String, dynamic>) {
      return (raw['result']?['data']?['json'] ?? <String, dynamic>{})
          as Map<String, dynamic>;
    }
    return {};
  }

  bool _isProcedureNotFound(DioException e) {
    final code = e.response?.statusCode;
    final body = e.response?.data?.toString() ?? '';
    return code == 404 || body.contains('NOT_FOUND') || body.contains('no procedure');
  }

  bool _isAuthError(DioException e) =>
      e.response?.statusCode == 401 || e.response?.statusCode == 403;

  Duration _backoffDelay(int failures) {
    final seconds = min(pow(2, failures).toInt() * 5, _maxBackoffSeconds);
    return Duration(seconds: seconds);
  }
}
