import 'package:flutter_riverpod/flutter_riverpod.dart';

export '../../../core/permissions/field_permission_coordinator.dart'
    show
        fieldPermissionCoordinatorProvider,
        FieldPermissionCoordinator,
        FieldPermissionState;

import '../../../core/auth/session_controller.dart';
import '../../../core/local/field_local_store.dart';
import '../../../core/location/background_location_service.dart';
import '../../../core/location/field_sync_store.dart';
import '../controllers/field_shift_controller.dart';
import '../models/field_models.dart';
import '../repository/field_repository.dart';
import '../sync/field_sync_worker.dart';

// ---------------------------------------------------------------------------
// SQLite local store — opened once per app process (singleton inside the class).
// ---------------------------------------------------------------------------

final fieldLocalStoreProvider = Provider<FieldLocalStore>((ref) {
  throw StateError(
    'fieldLocalStoreProvider must be overridden with an async-initialized value. '
    'Use ProviderScope overrides after awaiting FieldLocalStore.open().',
  );
});

// ---------------------------------------------------------------------------
// Shift controller — owns active shift state, start/end orchestration, and
// queue depth. Backend sync is handled by FieldSyncWorker (P1-4).
// ---------------------------------------------------------------------------

final fieldShiftControllerProvider =
    StateNotifierProvider<FieldShiftController, FieldShiftState>((ref) {
  return FieldShiftController(
    store: ref.watch(fieldLocalStoreProvider),
    syncStore: ref.watch(fieldSyncStoreProvider),
  );
});

// ---------------------------------------------------------------------------
// FieldSyncWorker — owns backend sync for the main isolate.
// deviceId and platform are resolved at runtime; call worker.updateDeviceInfo
// after login/session is available.
// ---------------------------------------------------------------------------

final fieldSyncWorkerProvider = Provider<FieldSyncWorker>((ref) {
  return FieldSyncWorker(
    store: ref.watch(fieldLocalStoreProvider),
    repository: ref.watch(fieldRepositoryProvider),
    deviceId: '',
    platform: '',
    workerName: 'main',
    onShiftCompleted: () {
      // The backend has acknowledged shift end and the queue is fully drained.
      // Now it is safe to tear down the capture/upload background service and
      // clear local shift state.
      BackgroundLocationService.stop();
      ref.read(fieldShiftControllerProvider.notifier).markCompleted();
    },
  );
});

// ---------------------------------------------------------------------------
// Existing providers (unchanged)
// ---------------------------------------------------------------------------

final activeShiftProvider =
    StreamProvider.autoDispose<ShiftModel?>((ref) async* {
  yield await ref.read(fieldRepositoryProvider).activeShift();
  await for (final _ in Stream.periodic(const Duration(seconds: 30))) {
    yield await ref.read(fieldRepositoryProvider).activeShift();
  }
});

final activeStopProvider =
    StreamProvider.autoDispose<FieldStopModel?>((ref) async* {
  yield await ref.read(fieldRepositoryProvider).activeStop();
  await for (final _ in Stream.periodic(const Duration(seconds: 30))) {
    yield await ref.read(fieldRepositoryProvider).activeStop();
  }
});

final todayAttendanceProvider =
    FutureProvider.autoDispose<List<AttendanceRecord>>((ref) async {
  final user = ref.watch(sessionControllerProvider).user;
  if (user == null) return const [];
  final now = DateTime.now().toUtc();
  final from = now.subtract(const Duration(days: 30));
  return ref.read(fieldRepositoryProvider).attendanceList(
        userId: user.id,
        from: from.toIso8601String().sliceDate(),
        to: now.toIso8601String().sliceDate(),
        limit: 30,
      );
});

final attendanceAdminProvider = FutureProvider.autoDispose.family<
    List<AttendanceRecord>,
    ({
      String? userId,
      String? from,
      String? to,
      String? status
    })>((ref, args) async {
  return ref.read(fieldRepositoryProvider).attendanceList(
        userId: args.userId,
        from: args.from,
        to: args.to,
        status: args.status,
        limit: 200,
      );
});

final visitsForShiftProvider = FutureProvider.autoDispose
    .family<List<FieldVisitModel>, String>((ref, shiftId) async {
  return ref.read(fieldRepositoryProvider).visitsForShift(shiftId);
});

final stopsForShiftProvider = FutureProvider.autoDispose
    .family<List<FieldStopModel>, String>((ref, shiftId) async {
  return ref.read(fieldRepositoryProvider).stopsForShift(shiftId);
});

final trailForShiftProvider = FutureProvider.autoDispose
    .family<TrailSnapshot, String>((ref, shiftId) async {
  return ref.read(fieldRepositoryProvider).trailForShift(shiftId);
});

final agentsProvider = FutureProvider.autoDispose<List<AgentLite>>((ref) async {
  return ref.read(fieldRepositoryProvider).listAgents();
});

final myScheduleProvider =
    FutureProvider.autoDispose<ShiftSchedule?>((ref) async {
  return ref.read(fieldRepositoryProvider).getMySchedule();
});

extension on String {
  String sliceDate() => length >= 10 ? substring(0, 10) : this;
}
