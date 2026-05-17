import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/attendance.dart';
import '../models/field_visit.dart';
import '../models/shift.dart';
import '../repository/field_repository.dart';

// ── active shift ─────────────────────────────────────────────────────────────

final activeShiftProvider = FutureProvider.autoDispose<Shift?>((ref) async {
  return ref.read(fieldRepositoryProvider).activeShift();
});

// ── visits for a shift ───────────────────────────────────────────────────────

final visitsForShiftProvider =
    FutureProvider.autoDispose.family<List<FieldVisit>, String>(
  (ref, shiftId) async {
    return ref.read(fieldRepositoryProvider).visitsForShift(shiftId);
  },
);

// ── attendance history ───────────────────────────────────────────────────────

/// Last 30 days of attendance for the current user.
final attendanceHistoryProvider =
    FutureProvider.autoDispose<List<DailyAttendance>>((ref) async {
  final now = DateTime.now().toUtc();
  final from = now.subtract(const Duration(days: 29));
  return ref.read(fieldRepositoryProvider).listAttendance(
        from: from.toIso8601String(),
        to: now.toIso8601String(),
        limit: 30,
      );
});
