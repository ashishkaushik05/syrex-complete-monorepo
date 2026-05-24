import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../db/field_local_store.dart';
import '../db/local_models.dart';
import '../field/field_sync_worker.dart';
import '../field/location_capture_service.dart';
import '../network/api_client.dart';

// ── FieldShiftState ───────────────────────────────────────────────────────────

class FieldShiftState {
  const FieldShiftState({
    this.localShift,
    this.syncStatus = SyncDisplay.idle,
    this.pendingPointCount = 0,
    this.lastError,
  });

  final LocalShift? localShift;
  final SyncDisplay syncStatus;
  final int pendingPointCount;
  final String? lastError;

  bool get hasActiveShift =>
      localShift != null &&
      localShift!.status != LocalShiftStatus.completed &&
      localShift!.status != LocalShiftStatus.conflict;

  bool get isSynced => localShift?.isSynced ?? false;

  FieldShiftState copyWith({
    LocalShift? localShift,
    bool clearLocalShift = false,
    SyncDisplay? syncStatus,
    int? pendingPointCount,
    String? lastError,
    bool clearError = false,
  }) =>
      FieldShiftState(
        localShift: clearLocalShift ? null : (localShift ?? this.localShift),
        syncStatus: syncStatus ?? this.syncStatus,
        pendingPointCount: pendingPointCount ?? this.pendingPointCount,
        lastError: clearError ? null : (lastError ?? this.lastError),
      );
}

enum SyncDisplay { idle, syncing, synced, error }

// ── FieldShiftController ──────────────────────────────────────────────────────

class FieldShiftController extends StateNotifier<FieldShiftState> {
  FieldShiftController(this._syncWorker) : super(const FieldShiftState()) {
    _restore();
  }

  final FieldSyncWorker _syncWorker;
  static const _uuid = Uuid();

  // ── init ───────────────────────────────────────────────────────────────────

  Future<void> _restore() async {
    final shift = await FieldLocalStore.instance.getActiveLocalShift();
    if (shift == null) return;
    final pending =
        await FieldLocalStore.instance.countPendingPoints(shift.clientShiftId);
    state = state.copyWith(
      localShift: shift,
      syncStatus: shift.isSynced ? SyncDisplay.synced : SyncDisplay.idle,
      pendingPointCount: pending,
    );
    // Resume location capture if shift is still active.
    if (shift.status != LocalShiftStatus.completed &&
        shift.status != LocalShiftStatus.conflict) {
      LocationCaptureService.instance
          .start(clientShiftId: shift.clientShiftId, source: 'restart_recovery');
    }
    // Kick off a sync attempt on restore.
    _runSync();
  }

  // ── public ─────────────────────────────────────────────────────────────────

  Future<void> startShift() async {
    if (state.hasActiveShift) return;
    final clientShiftId = _uuid.v4();
    final startedAt = DateTime.now().toUtc().toIso8601String();

    final localShift = await FieldLocalStore.instance.createShift(
      clientShiftId: clientShiftId,
      startedAt: startedAt,
    );

    state = state.copyWith(
      localShift: localShift,
      syncStatus: SyncDisplay.syncing,
      pendingPointCount: 0,
    );

    await LocationCaptureService.instance
        .start(clientShiftId: clientShiftId, source: 'foreground');
    _runSync();
  }

  Future<void> endShift() async {
    final shift = state.localShift;
    if (shift == null) return;

    final endedAt = DateTime.now().toUtc().toIso8601String();
    await FieldLocalStore.instance.markShiftEndingPending(
      clientShiftId: shift.clientShiftId,
      endedAt: endedAt,
    );

    LocationCaptureService.instance.stop();

    final updated =
        await FieldLocalStore.instance.getShiftByClientId(shift.clientShiftId);
    state = state.copyWith(localShift: updated, syncStatus: SyncDisplay.syncing);
    _runSync();
  }

  Future<void> refreshPendingCount() async {
    final shift = state.localShift;
    if (shift == null) return;
    final count =
        await FieldLocalStore.instance.countPendingPoints(shift.clientShiftId);
    state = state.copyWith(pendingPointCount: count);
  }

  Future<void> retrySync() async => _runSync();

  @override
  void dispose() {
    // Cancel any pending retry timer and mark the worker as not running.
    _syncWorker.cancel();
    super.dispose();
  }

  // ── internal ───────────────────────────────────────────────────────────────

  Future<void> _runSync() async {
    state = state.copyWith(syncStatus: SyncDisplay.syncing);
    try {
      await _syncWorker.runOnce();
      final shift = state.localShift;
      if (shift != null) {
        final updated = await FieldLocalStore.instance
            .getShiftByClientId(shift.clientShiftId);
        final pending = updated == null
            ? 0
            : await FieldLocalStore.instance
                .countPendingPoints(shift.clientShiftId);
        state = state.copyWith(
          localShift: updated,
          syncStatus: updated?.isSynced == true
              ? SyncDisplay.synced
              : SyncDisplay.idle,
          pendingPointCount: pending,
          clearError: true,
        );
      }
    } catch (e) {
      state = state.copyWith(
        syncStatus: SyncDisplay.error,
        lastError: e.toString(),
      );
    }
  }
}

// ── providers ─────────────────────────────────────────────────────────────────

final fieldSyncWorkerProvider = Provider<FieldSyncWorker>((ref) {
  final dio = ref.watch(dioProvider);
  return FieldSyncWorker(dio);
});

final fieldShiftControllerProvider =
    StateNotifierProvider<FieldShiftController, FieldShiftState>((ref) {
  final worker = ref.watch(fieldSyncWorkerProvider);
  return FieldShiftController(worker);
});
