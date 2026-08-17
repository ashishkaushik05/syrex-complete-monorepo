import 'dart:async';
import 'dart:convert';
import 'dart:math' show Random;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/local/field_local_store.dart';
import '../repository/field_repository.dart';

/// Backoff delay table (seconds). Capped at 30 s so that an agent who regains
/// connectivity resumes uploading within at most ~30 s rather than idling for
/// several minutes — the live map must stay as close to real time as possible.
const _kBackoffSeconds = [2, 5, 10, 20, 30];

final _random = Random();

/// Owns backend sync for the main isolate.
///
/// Call [start] once a shift is active. The worker polls every 5 seconds,
/// syncing pending location points to the backend and managing shift-lifecycle
/// calls (syncStart, syncEnd).
///
/// Call [stop] when the shift completes and no further sync is needed, or
/// when the app goes to the background and the background service takes over.
class FieldSyncWorker {
  FieldSyncWorker({
    required FieldLocalStore store,
    required FieldRepository repository,
    required String deviceId,
    required String platform,
    required String workerName,
    this.onShiftCompleted,
  })  : _store = store,
        _repository = repository,
        _deviceId = deviceId,
        _platform = platform,
        _workerName = workerName;

  /// Optional callback invoked after the backend acknowledges shift end.
  /// Use this to notify [FieldShiftController] that the shift is fully complete.
  final VoidCallback? onShiftCompleted;

  final FieldLocalStore _store;
  final FieldRepository _repository;
  final String _workerName;
  String _deviceId;
  String _platform;

  Timer? _timer;
  int _consecutiveFailures = 0;
  DateTime? _nextFireAfter;
  bool _syncing = false;

  bool get isRunning => _timer != null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /// Begin the sync loop (Timer.periodic every 5 s).
  void start() {
    if (_timer != null) return;
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _tick());
    _log('started');
    // Fire an immediate first pass instead of waiting a full interval.
    unawaited(_tick());
  }

  /// Run a single sync pass on demand (used by the background-service isolate,
  /// which drives uploads while the app is backgrounded). Re-entrant calls and
  /// the periodic timer share the same [_syncing] guard so only one pass runs
  /// at a time within an isolate. Honours the backoff window so repeated
  /// triggers (e.g. one per captured point) don't hammer the network while
  /// offline.
  Future<void> syncNow() async {
    final nextFire = _nextFireAfter;
    if (nextFire != null && DateTime.now().isBefore(nextFire)) return;
    if (_syncing) return;
    _syncing = true;
    try {
      await _syncOnce();
    } catch (e, st) {
      _log('unhandled error in syncNow: $e\n$st');
      _applyBackoff();
    } finally {
      _syncing = false;
    }
  }

  /// Cancel the timer. Does not block on in-flight network calls.
  void stop() {
    _timer?.cancel();
    _timer = null;
    _log('stopped');
  }

  /// Update device/platform info (e.g. after login resolves device ID).
  void updateDeviceInfo({required String deviceId, required String platform}) {
    _deviceId = deviceId;
    _platform = platform;
  }

  // ---------------------------------------------------------------------------
  // Sync loop
  // ---------------------------------------------------------------------------

  Future<void> _tick() async {
    // Respect backoff window.
    final nextFire = _nextFireAfter;
    if (nextFire != null && DateTime.now().isBefore(nextFire)) return;
    if (_syncing) return;

    _syncing = true;
    try {
      await _syncOnce();
    } catch (e, st) {
      _log('unhandled error in _syncOnce: $e\n$st');
      _applyBackoff();
    } finally {
      _syncing = false;
    }
  }

  Future<void> _syncOnce() async {
    // 1. Load active shift.
    final shift = await _store.getActiveShift();
    if (shift == null) return;

    // P0-2: Reset any stale in-flight leases so they re-enter the pending queue.
    await _store.resetExpiredLeases(shift.clientShiftId);
    // P0-3: Prune oldest points if the queue exceeds the storage cap.
    await _store.enforceQueueCap(shift.clientShiftId);

    final clientShiftId = shift.clientShiftId;

    // 2. Sync start if not yet acknowledged by server.
    String serverShiftId;
    if (shift.serverShiftId == null) {
      try {
        await _store.updateShiftStatus(
          clientShiftId,
          ShiftStatus.syncingStart,
        );
        final result = await _repository.syncStartShift(
          clientShiftId: clientShiftId,
          startedAt: DateTime.parse(shift.startedAt),
          deviceId: _deviceId,
          platform: _platform.isNotEmpty ? _platform : null,
        );
        serverShiftId = result.serverShiftId;
        final now = DateTime.now().toUtc().toIso8601String();
        await _store.updateShiftServerIds(
          clientShiftId,
          serverShiftId,
          startSyncedAt: now,
        );
        await _store.updateShiftStatus(clientShiftId, ShiftStatus.serverActive);
        await _store.clearShiftError(clientShiftId);
        _resetBackoff();
      } on DioException catch (e) {
        await _store.updateShiftStatus(
          clientShiftId,
          ShiftStatus.startFailedRetryable,
        );
        await _handleDioError(
          e,
          clientShiftId,
          null,
          'START_SYNC_FAILED',
          operation: 'syncStart',
        );
        return;
      } catch (e, st) {
        _log('syncStart error: $e\n$st');
        await _store.updateShiftStatus(
          clientShiftId,
          ShiftStatus.startFailedRetryable,
        );
        await _store.updateShiftError(clientShiftId, 'START_SYNC_FAILED');
        _applyBackoff();
        return;
      }
    } else {
      serverShiftId = shift.serverShiftId!;
      if (shift.status == ShiftStatus.serverActive &&
          shift.lastErrorCode != null) {
        await _store.clearShiftError(clientShiftId);
      }
    }

    // 3. Get pending points.
    final pendingPoints =
        await _store.getPendingPoints(clientShiftId, limit: 500);

    // 4. Ingest pending points if any.
    if (pendingPoints.isNotEmpty) {
      final pointIds = pendingPoints.map((p) => p.clientPointId).toList();

      await _store.markPointsInFlight(pointIds);

      final batch = pendingPoints
          .map((p) => <String, dynamic>{
                'clientPointId': p.clientPointId,
                'lat': p.lat,
                'lng': p.lng,
                'accuracy': p.accuracy,
                'recordedAt': p.recordedAt,
              })
          .toList();

      try {
        final ack = await _repository.ingestLocationsV2(
          clientShiftId: clientShiftId,
          serverShiftId: serverShiftId,
          deviceId: _deviceId,
          points: batch,
        );

        if (ack.retryable) {
          // Reset in-flight points back to pending.
          await _store.resetInflightToPending(clientShiftId);
          await _store.updateShiftError(clientShiftId, 'SHIFT_NOT_SYNCED');
          _applyBackoff();
          return;
        }

        // Mark acked/duplicate/rejected.
        await _store.markPointsAcked(ack.accepted);
        await _store.markPointsDuplicate(ack.duplicates);

        if (ack.rejected.isNotEmpty) {
          // Build rejection maps expected by markPointsRejected.
          final rejectionMaps = ack.rejected
              .map((id) =>
                  <String, String>{'clientPointId': id, 'reason': 'REJECTED'})
              .toList();
          await _store.markPointsRejected(rejectionMaps);
        }

        await _store.clearShiftError(clientShiftId);
        _resetBackoff();
      } on DioException catch (e) {
        // Reset in-flight back to pending so they are retried.
        await _store.resetInflightToPending(clientShiftId);
        await _handleDioError(
          e,
          clientShiftId,
          serverShiftId,
          null,
          pendingQueueDepth: pendingPoints.length,
          operation: 'ingestV2',
        );
        return;
      } catch (e, st) {
        _log('ingest error: $e\n$st');
        await _store.resetInflightToPending(clientShiftId);
        _applyBackoff();
        return;
      }
    }

    // 4b. Sync pending events.
    final pendingEvents =
        await _store.getPendingEvents(clientShiftId, limit: 50);
    if (pendingEvents.isNotEmpty) {
      final eventIds = pendingEvents.map((e) => e.clientEventId).toList();
      await _store.markEventsInFlight(eventIds);

      for (final event in pendingEvents) {
        try {
          final payload = jsonDecode(event.payloadJson) as Map<String, dynamic>;

          if (event.eventType == 'visit') {
            await _repository.logVisitFromEvent(
              clientEventId: event.clientEventId,
              shiftId: serverShiftId,
              lat: (payload['lat'] as num).toDouble(),
              lng: (payload['lng'] as num).toDouble(),
              description: payload['description'] as String?,
              recordedAt: payload['recordedAt'] as String?,
            );
          } else if (event.eventType == 'stop') {
            await _repository.reportStop(
              clientEventId: event.clientEventId,
              shiftId: serverShiftId,
              lat: (payload['lat'] as num).toDouble(),
              lng: (payload['lng'] as num).toDouble(),
              reason: payload['reason'] as String?,
              notes: payload['notes'] as String?,
              startedAt: payload['startedAt'] as String,
            );
          }

          await _store.markEventsAcked([event.clientEventId]);
        } on DioException catch (e) {
          final status = e.response?.statusCode;
          if (status == 409 || status == 200) {
            // Duplicate — treat as success.
            await _store.markEventsAcked([event.clientEventId]);
          } else if (status != null && status >= 400 && status < 500) {
            // Non-retryable client error.
            await _store.markEventsRejected([
              {
                'clientEventId': event.clientEventId,
                'reason': 'HTTP_$status',
              }
            ]);
          } else {
            // Network / 5xx — reset all to pending and back off.
            await _store.resetInflightEvents(clientShiftId);
            _applyBackoff();
            return;
          }
        } catch (e, st) {
          _log('event sync error: $e\n$st');
          await _store.resetInflightEvents(clientShiftId);
          _applyBackoff();
          return;
        }
      }
    }

    // 5. Report health.
    final queueDepth = await _store.getPendingPointCount(clientShiftId);
    await _repository.reportSyncStatus(
      deviceId: _deviceId,
      clientShiftId: clientShiftId,
      serverShiftId: serverShiftId,
      platform: _platform.isNotEmpty ? _platform : null,
      pendingQueueDepth: queueDepth,
      lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
    );

    // 6. Finalize shift end if all points are drained.
    final currentShift = await _store.getActiveShift();
    if (currentShift != null &&
        currentShift.status == ShiftStatus.endingPending &&
        queueDepth == 0) {
      final endedAt = currentShift.endedAt != null
          ? DateTime.parse(currentShift.endedAt!)
          : DateTime.now().toUtc();
      try {
        await _repository.syncEndShift(
          clientShiftId: clientShiftId,
          endedAt: endedAt,
          deviceId: _deviceId,
        );
        final now = DateTime.now().toUtc().toIso8601String();
        await _store.updateShiftEndSynced(clientShiftId, now);
        await _store.updateShiftStatus(clientShiftId, ShiftStatus.completed);
        await _store.clearShiftError(clientShiftId);
        // Shift is complete — no more sync needed.
        stop();
        onShiftCompleted?.call();
      } on DioException catch (e) {
        await _store.updateShiftStatus(
          clientShiftId,
          ShiftStatus.endFailedRetryable,
        );
        await _handleDioError(
          e,
          clientShiftId,
          serverShiftId,
          'END_SYNC_FAILED',
          operation: 'syncEnd',
        );
      } catch (e, st) {
        _log('syncEnd error: $e\n$st');
        await _store.updateShiftStatus(
          clientShiftId,
          ShiftStatus.endFailedRetryable,
        );
        await _store.updateShiftError(clientShiftId, 'END_SYNC_FAILED');
        _applyBackoff();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Error handling helpers
  // ---------------------------------------------------------------------------

  Future<void> _handleDioError(
    DioException e,
    String clientShiftId,
    String? serverShiftId,
    String? defaultErrorCode, {
    int pendingQueueDepth = 0,
    required String operation,
  }) async {
    final status = e.response?.statusCode;
    final responseText = _boundedResponse(e.response?.data);
    _log(
      '$operation failed: status=${status ?? 'network'} '
      'type=${e.type.name} path=${e.requestOptions.path}'
      '${responseText.isEmpty ? '' : ' response=$responseText'}',
    );

    if (status == 401) {
      _log('401 Unauthorized - long backoff');
      await _store.updateShiftError(clientShiftId, 'UNAUTHORIZED');
      await _repository.reportSyncStatus(
        deviceId: _deviceId,
        clientShiftId: clientShiftId,
        serverShiftId: serverShiftId,
        platform: _platform.isNotEmpty ? _platform : null,
        pendingQueueDepth: pendingQueueDepth,
        lastSyncErrorCode: 'UNAUTHORIZED',
        lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
      );
      // Apply maximum backoff for auth errors.
      _consecutiveFailures = _kBackoffSeconds.length - 1;
      _applyBackoff();
      return;
    }

    final isNetworkError = e.response == null;
    final is5xx = (status ?? 0) >= 500;
    final errorCode = defaultErrorCode ??
        (isNetworkError
            ? 'NETWORK_ERROR'
            : is5xx
                ? 'SERVER_ERROR'
                : 'SYNC_ERROR');

    await _store.updateShiftError(clientShiftId, errorCode);
    await _repository.reportSyncStatus(
      deviceId: _deviceId,
      clientShiftId: clientShiftId,
      serverShiftId: serverShiftId,
      platform: _platform.isNotEmpty ? _platform : null,
      pendingQueueDepth: pendingQueueDepth,
      lastSyncErrorCode: errorCode,
      lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
    );
    _applyBackoff();
  }

  void _applyBackoff() {
    final idx = _consecutiveFailures.clamp(0, _kBackoffSeconds.length - 1);
    final baseSec = _kBackoffSeconds[idx];
    // ±20% jitter
    final jitterSec = (baseSec * 0.2 * (_random.nextDouble() * 2 - 1)).round();
    final delaySec = (baseSec + jitterSec).clamp(1, 300);
    _nextFireAfter = DateTime.now().add(Duration(seconds: delaySec));
    _consecutiveFailures++;
    _log(
      'backoff: ${delaySec}s '
      '(base ${baseSec}s, failure #$_consecutiveFailures)',
    );
  }

  void _resetBackoff() {
    _consecutiveFailures = 0;
    _nextFireAfter = null;
  }

  String _boundedResponse(dynamic data) {
    if (data == null) return '';
    String raw;
    try {
      raw = data is String ? data : jsonEncode(data);
    } catch (_) {
      raw = data.toString();
    }
    const maxLength = 500;
    return raw.length <= maxLength ? raw : '${raw.substring(0, maxLength)}...';
  }

  void _log(String message) {
    debugPrint('[FieldSyncWorker:$_workerName] $message');
  }
}
