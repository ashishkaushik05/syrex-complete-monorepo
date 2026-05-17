class ShiftModel {
  const ShiftModel({
    required this.id,
    required this.agentId,
    required this.orgId,
    required this.startedAt,
    required this.endedAt,
    required this.startType,
    required this.endType,
    required this.status,
  });

  final String id;
  final String agentId;
  final String orgId;
  final String startedAt;
  final String? endedAt;
  final String startType;
  final String? endType;
  final String status;

  bool get isActive => status == 'active';

  factory ShiftModel.fromJson(Map<String, dynamic> json) => ShiftModel(
        id: json['id'] as String,
        agentId: json['agentId'] as String,
        orgId: json['orgId'] as String,
        startedAt: json['startedAt'] as String,
        endedAt: json['endedAt'] as String?,
        startType: json['startType'] as String,
        endType: json['endType'] as String?,
        status: json['status'] as String,
      );
}

class FieldVisitModel {
  const FieldVisitModel({
    required this.id,
    required this.agentId,
    required this.shiftId,
    required this.lat,
    required this.lng,
    required this.recordedAt,
    this.description,
    this.audioUrl,
    this.outletId,
    this.customerId,
  });

  final String id;
  final String agentId;
  final String shiftId;
  final double lat;
  final double lng;
  final String recordedAt;
  final String? description;
  final String? audioUrl;
  final String? outletId;
  final String? customerId;

  factory FieldVisitModel.fromJson(Map<String, dynamic> json) => FieldVisitModel(
        id: json['id'] as String,
        agentId: json['agentId'] as String,
        shiftId: json['shiftId'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        recordedAt: json['recordedAt'] as String,
        description: json['description'] as String?,
        audioUrl: json['audioUrl'] as String?,
        outletId: json['outletId'] as String?,
        customerId: json['customerId'] as String?,
      );
}

class FieldStopModel {
  const FieldStopModel({
    required this.id,
    required this.agentId,
    required this.shiftId,
    required this.lat,
    required this.lng,
    required this.startedAt,
    required this.endedAt,
    this.reason,
    this.notes,
  });

  final String id;
  final String agentId;
  final String shiftId;
  final double lat;
  final double lng;
  final String startedAt;
  final String? endedAt;
  final String? reason;
  final String? notes;

  bool get isActive => endedAt == null;

  factory FieldStopModel.fromJson(Map<String, dynamic> json) => FieldStopModel(
        id: json['id'] as String,
        agentId: json['agentId'] as String,
        shiftId: json['shiftId'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        startedAt: json['startedAt'] as String,
        endedAt: json['endedAt'] as String?,
        reason: json['reason'] as String?,
        notes: json['notes'] as String?,
      );
}

enum AttendanceStatus { present, absent, halfDay, leave }

extension AttendanceStatusX on AttendanceStatus {
  String get apiValue => switch (this) {
        AttendanceStatus.present => 'present',
        AttendanceStatus.absent => 'absent',
        AttendanceStatus.halfDay => 'half_day',
        AttendanceStatus.leave => 'leave',
      };

  String get label => switch (this) {
        AttendanceStatus.present => 'Present',
        AttendanceStatus.absent => 'Absent',
        AttendanceStatus.halfDay => 'Half Day',
        AttendanceStatus.leave => 'Leave',
      };

  static AttendanceStatus fromApi(String raw) => switch (raw) {
        'present' => AttendanceStatus.present,
        'absent' => AttendanceStatus.absent,
        'half_day' => AttendanceStatus.halfDay,
        'leave' => AttendanceStatus.leave,
        _ => AttendanceStatus.present,
      };
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.userId,
    required this.userName,
    required this.date,
    required this.status,
    required this.markedAt,
    this.note,
  });

  final String id;
  final String userId;
  final String? userName;
  final String date;
  final AttendanceStatus status;
  final String markedAt;
  final String? note;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) => AttendanceRecord(
        id: json['id'] as String,
        userId: json['userId'] as String,
        userName: json['userName'] as String?,
        date: json['date'] as String,
        status: AttendanceStatusX.fromApi(json['status'] as String),
        markedAt: json['markedAt'] as String,
        note: json['note'] as String?,
      );
}

class AgentLite {
  const AgentLite({required this.id, required this.name});

  final String id;
  final String name;

  factory AgentLite.fromJson(Map<String, dynamic> json) => AgentLite(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
      );
}

class TrailPoint {
  const TrailPoint({
    required this.lat,
    required this.lng,
    required this.recordedAt,
  });

  final double lat;
  final double lng;
  final String recordedAt;

  factory TrailPoint.fromJson(Map<String, dynamic> json) => TrailPoint(
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        recordedAt: json['recordedAt'] as String,
      );
}

class TrailSnapshot {
  const TrailSnapshot({
    required this.points,
    required this.totalDistanceMeters,
    required this.durationSeconds,
  });

  final List<TrailPoint> points;
  final int totalDistanceMeters;
  final int? durationSeconds;

  factory TrailSnapshot.fromJson(Map<String, dynamic> json) => TrailSnapshot(
        points: (json['points'] as List<dynamic>)
            .map((e) => TrailPoint.fromJson(e as Map<String, dynamic>))
            .toList(),
        totalDistanceMeters: (json['totalDistanceMeters'] as num?)?.toInt() ?? 0,
        durationSeconds: (json['durationSeconds'] as num?)?.toInt(),
      );
}
