import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/session_controller.dart';
import '../models/field_models.dart';
import '../repository/field_repository.dart';

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
