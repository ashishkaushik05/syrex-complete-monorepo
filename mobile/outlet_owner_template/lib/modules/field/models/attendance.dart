enum AttendanceStatus { present, absent, halfDay, leave }

extension AttendanceStatusX on AttendanceStatus {
  String get value {
    switch (this) {
      case AttendanceStatus.present:
        return 'present';
      case AttendanceStatus.absent:
        return 'absent';
      case AttendanceStatus.halfDay:
        return 'half_day';
      case AttendanceStatus.leave:
        return 'leave';
    }
  }

  String get label {
    switch (this) {
      case AttendanceStatus.present:
        return 'Present';
      case AttendanceStatus.absent:
        return 'Absent';
      case AttendanceStatus.halfDay:
        return 'Half Day';
      case AttendanceStatus.leave:
        return 'Leave';
    }
  }

  static AttendanceStatus fromString(String s) {
    switch (s) {
      case 'present':
        return AttendanceStatus.present;
      case 'absent':
        return AttendanceStatus.absent;
      case 'half_day':
        return AttendanceStatus.halfDay;
      case 'leave':
        return AttendanceStatus.leave;
      default:
        return AttendanceStatus.present;
    }
  }
}

class DailyAttendance {
  const DailyAttendance({
    required this.id,
    required this.userId,
    required this.date,
    required this.status,
    this.note,
    this.markedBy,
    this.markedAt,
    this.userName,
    this.orgId,
  });

  final String id;
  final String userId;
  final String date; // YYYY-MM-DD
  final AttendanceStatus status;
  final String? note;
  final String? markedBy;
  final String? markedAt;
  final String? userName;
  final String? orgId;

  factory DailyAttendance.fromJson(Map<String, dynamic> j) => DailyAttendance(
        id: j['id'] as String,
        userId: j['userId'] as String,
        date: j['date'] as String,
        status: AttendanceStatusX.fromString(j['status'] as String),
        note: j['note'] as String?,
        markedBy: j['markedBy'] as String?,
        markedAt: j['markedAt'] as String?,
        userName: j['userName'] as String?,
        orgId: j['orgId'] as String?,
      );
}
