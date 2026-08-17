import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/local/field_local_store.dart';
import '../../../core/location/field_sync_store.dart';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

class FieldShiftState {
  const FieldShiftState({
    this.activeShift,
    this.isLoading = false,
    this.error,
    this.pendingPointCount = 0,
  });

  /// The currently active local shift, or null if no shift is active.
  final LocalFieldShift? activeShift;

  /// True while an async operation is in progress.
  final bool isLoading;

  /// Last error message, or null if no error.
  final String? error;

  /// Number of points currently in pending state for the active shift.
  final int pendingPointCount;

  bool get hasActiveShift => activeShift != null;

  FieldShiftState copyWith({
    LocalFieldShift? activeShift,
    bool clearShift = false,
    bool? isLoading,
    String? error,
    bool clearError = false,
    int? pendingPointCount,
  }) =>
      FieldShiftState(
        activeShift: clearShift ? null : (activeShift ?? this.activeShift),
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : (error ?? this.error),
        pendingPointCount: pendingPointCount ?? this.pendingPointCount,
      );
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

class FieldShiftController extends StateNotifier<FieldShiftState> {
  FieldShiftController({
    required FieldLocalStore store,
    required FieldSyncStore syncStore,
  })  : _store = store,
        _syncStore = syncStore,
        super(const FieldShiftState(isLoading: true)) {
    _recover();
    // Reconcile in-memory state with the SQLite source of truth every few
    // seconds. The FieldSyncWorker (foreground AND background isolates) writes
    // shift status + drains the point queue directly in the DB; without this
    // poll the controller would keep showing the initial `local_active` status
    // and a stale queue depth forever (e.g. the "pending sync" banner never
    // clears even though sync succeeded).
    _refreshTimer =
        Timer.periodic(const Duration(seconds: 3), (_) => _refreshFromStore());
  }

  final FieldLocalStore _store;
  final FieldSyncStore _syncStore;
  Timer? _refreshTimer;

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  // -------------------------------------------------------------------------
  // Recovery
  // -------------------------------------------------------------------------

  /// Called on construction. Loads any persisted active shift from the local
  /// store and resets in-flight points to pending (crash recovery).
  Future<void> _recover() async {
    try {
      final shift = await _store.getActiveShift();
      if (shift != null) {
        // Recover in-flight points that may have been abandoned on process death.
        await _store.resetInflightToPending(shift.clientShiftId);
        final pendingCount =
            await _store.getPendingPointCount(shift.clientShiftId);
        state = FieldShiftState(
          activeShift: shift,
          pendingPointCount: pendingCount,
        );
      } else {
        state = const FieldShiftState();
      }
    } catch (e, st) {
      debugPrint('[FieldShiftController] recovery error: $e\n$st');
      state = FieldShiftState(
        error: 'Recovery failed: $e',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Start shift
  // -------------------------------------------------------------------------

  /// Starts a new shift locally.
  ///
  /// If a shift is already active, this is a no-op (duplicate start guard).
  /// Backend sync is intentionally deferred to [FieldSyncWorker].
  Future<void> startShift(String deviceId, String platform) async {
    if (state.hasActiveShift) {
      debugPrint(
        '[FieldShiftController] startShift ignored — shift already active: '
        '${state.activeShift!.clientShiftId}',
      );
      return;
    }

    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final now = DateTime.now().toUtc().toIso8601String();
      final clientShiftId = FieldSyncStore.newClientShiftId(deviceId);
      final shift = LocalFieldShift(
        clientShiftId: clientShiftId,
        status: ShiftStatus.localActive,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      );
      await _store.insertShift(shift);
      await _syncStore.saveActiveShift(
          clientShiftId: clientShiftId, serverShiftId: '');
      state = FieldShiftState(
        activeShift: shift,
        pendingPointCount: 0,
      );
    } catch (e, st) {
      debugPrint('[FieldShiftController] startShift error: $e\n$st');
      state = state.copyWith(isLoading: false, error: 'Start shift failed: $e');
    }
  }

  // -------------------------------------------------------------------------
  // End shift
  // -------------------------------------------------------------------------

  /// Marks the active shift as ending locally.
  ///
  /// If no shift is active, this is a no-op (duplicate end guard).
  /// Backend sync is intentionally deferred to [FieldSyncWorker].
  Future<void> endShift() async {
    final current = state.activeShift;
    if (current == null) {
      debugPrint('[FieldShiftController] endShift ignored — no active shift');
      return;
    }

    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final now = DateTime.now().toUtc().toIso8601String();
      await _store.updateShiftEndedAt(current.clientShiftId, now);
      await _store.updateShiftStatus(
          current.clientShiftId, ShiftStatus.endingPending);
      final updated = current.copyWith(
        status: ShiftStatus.endingPending,
        endedAt: now,
        updatedAt: now,
      );
      state = state.copyWith(
        activeShift: updated,
        isLoading: false,
        clearError: true,
      );
    } catch (e, st) {
      debugPrint('[FieldShiftController] endShift error: $e\n$st');
      state = state.copyWith(isLoading: false, error: 'End shift failed: $e');
    }
  }

  // -------------------------------------------------------------------------
  // Sync worker callback
  // -------------------------------------------------------------------------

  /// Called by [FieldSyncWorker] after the backend acknowledges shift end.
  /// Clears the active shift from state.
  Future<void> markCompleted() async {
    await _syncStore.clearActiveShift();
    state = state.copyWith(
      clearShift: true,
      isLoading: false,
      clearError: true,
      pendingPointCount: 0,
    );
    debugPrint('[FieldShiftController] shift marked completed by sync worker');
  }

  // -------------------------------------------------------------------------
  // Queue depth refresh
  // -------------------------------------------------------------------------

  /// Reloads the pending point count for the active shift into state.
  Future<void> refreshQueueDepth() async {
    final current = state.activeShift;
    if (current == null) return;
    try {
      final count =
          await _store.getPendingPointCount(current.clientShiftId);
      state = state.copyWith(pendingPointCount: count);
    } catch (e) {
      debugPrint('[FieldShiftController] refreshQueueDepth error: $e');
    }
  }

  /// Periodic reconciliation: pull the authoritative shift row + queue depth
  /// from SQLite (written by the sync worker in either isolate) so the UI
  /// reflects status transitions (local_active → server_active) and a draining
  /// queue. No-op while loading or when no shift is active locally.
  Future<void> _refreshFromStore() async {
    if (state.isLoading) return;
    final current = state.activeShift;
    if (current == null) return;
    try {
      final shift = await _store.getActiveShift();
      if (shift == null) {
        // The shift was finalized elsewhere (e.g. the background isolate
        // completed syncEnd). Reflect that locally.
        await _syncStore.clearActiveShift();
        state = state.copyWith(clearShift: true, pendingPointCount: 0);
        return;
      }
      final count = await _store.getPendingPointCount(shift.clientShiftId);
      state = state.copyWith(activeShift: shift, pendingPointCount: count);
    } catch (e) {
      debugPrint('[FieldShiftController] _refreshFromStore error: $e');
    }
  }
}
