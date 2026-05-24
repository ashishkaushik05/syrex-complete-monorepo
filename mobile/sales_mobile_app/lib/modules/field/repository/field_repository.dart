import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../models/field_models.dart';

class FieldRepository {
  FieldRepository(this._dio);

  final Dio _dio;

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
    return <String, dynamic>{};
  }

  dynamic _extractRaw(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) {
        return first['result']?['data']?['json'];
      }
    }
    if (raw is Map<String, dynamic>) {
      return raw['result']?['data']?['json'];
    }
    return null;
  }

  List<dynamic> _extractList(dynamic raw) {
    final inner = _extractRaw(raw);
    if (inner is List) return inner;
    return const [];
  }

  Future<ShiftModel?> activeShift() async {
    final res = await _dio.get('/fieldShifts.active', queryParameters: {
      'input': jsonEncode({'json': {}}),
    });
    final inner = _extractRaw(res.data);
    if (inner == null) return null;
    return ShiftModel.fromJson(inner as Map<String, dynamic>);
  }

  Future<ShiftModel> startShift() async {
    final res = await _dio.post(
      '/fieldShifts.start',
      data: jsonEncode({'json': {}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return ShiftModel.fromJson(_extract(res.data));
  }

  Future<ShiftSyncResult> syncStartShift({
    required String clientShiftId,
    required DateTime startedAt,
    required String deviceId,
    String? orgId,
    String? platform,
    String? appVersion,
  }) async {
    final res = await _dio.post(
      '/fieldShifts.syncStart',
      data: jsonEncode({
        'json': {
          'clientShiftId': clientShiftId,
          'startedAt': startedAt.toUtc().toIso8601String(),
          'deviceId': deviceId,
          if (orgId != null && orgId.isNotEmpty) 'orgId': orgId,
          if (platform != null && platform.isNotEmpty) 'platform': platform,
          if (appVersion != null && appVersion.isNotEmpty) 'appVersion': appVersion,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return ShiftSyncResult.fromJson(_extract(res.data));
  }

  Future<ShiftModel> endShift() async {
    final res = await _dio.post(
      '/fieldShifts.end',
      data: jsonEncode({'json': {}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return ShiftModel.fromJson(_extract(res.data));
  }

  Future<ShiftSyncResult> syncEndShift({
    required String clientShiftId,
    required DateTime endedAt,
    required String deviceId,
    String? orgId,
  }) async {
    final res = await _dio.post(
      '/fieldShifts.syncEnd',
      data: jsonEncode({
        'json': {
          'clientShiftId': clientShiftId,
          'endedAt': endedAt.toUtc().toIso8601String(),
          'deviceId': deviceId,
          if (orgId != null && orgId.isNotEmpty) 'orgId': orgId,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return ShiftSyncResult.fromJson(_extract(res.data));
  }

  Future<ShiftModel> extendShift() async {
    final res = await _dio.post(
      '/fieldShifts.extend',
      data: jsonEncode({'json': {}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return ShiftModel.fromJson(_extract(res.data));
  }

  Future<List<ShiftModel>> shiftsForDate({String? agentId, String? date}) async {
    final res = await _dio.get('/fieldShifts.list', queryParameters: {
      'input': jsonEncode({
        'json': {
          'limit': 30,
          if (agentId != null) 'agentId': agentId,
          if (date != null) 'date': date,
        }
      }),
    });
    return _extractList(res.data)
        .map((e) => ShiftModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FieldVisitModel> logVisit({
    required double lat,
    required double lng,
    String? outletId,
    String? customerId,
    String? notes,
    String? audioUrl,
    DateTime? recordedAt,
  }) async {
    final res = await _dio.post(
      '/fieldVisits.log',
      data: jsonEncode({
        'json': {
          'lat': lat,
          'lng': lng,
          if (outletId != null && outletId.isNotEmpty) 'outletId': outletId,
          if (customerId != null && customerId.isNotEmpty)
            'customerId': customerId,
          if (notes != null && notes.isNotEmpty) 'description': notes,
          if (audioUrl != null && audioUrl.isNotEmpty) 'audioUrl': audioUrl,
          if (recordedAt != null) 'recordedAt': recordedAt.toUtc().toIso8601String(),
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return FieldVisitModel.fromJson(_extract(res.data));
  }

  Future<List<FieldVisitModel>> visitsForShift(String shiftId) async {
    final res = await _dio.get('/fieldVisits.forShift', queryParameters: {
      'input': jsonEncode({'json': {'shiftId': shiftId}}),
    });
    return _extractList(res.data)
        .map((e) => FieldVisitModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FieldStopModel?> activeStop() async {
    final res = await _dio.get('/fieldStops.active', queryParameters: {
      'input': jsonEncode({'json': {}}),
    });
    final inner = _extractRaw(res.data);
    if (inner == null) return null;
    return FieldStopModel.fromJson(inner as Map<String, dynamic>);
  }

  Future<List<FieldStopModel>> stopsForShift(String shiftId) async {
    final res = await _dio.get('/fieldStops.list', queryParameters: {
      'input': jsonEncode({
        'json': {'shiftId': shiftId, 'limit': 150}
      }),
    });
    return _extractList(res.data)
        .map((e) => FieldStopModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<FieldStopModel> startStop({
    required double lat,
    required double lng,
    required String reason,
    String? notes,
  }) async {
    final res = await _dio.post(
      '/fieldStops.start',
      data: jsonEncode({
        'json': {
          'lat': lat,
          'lng': lng,
          'reason': reason,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return FieldStopModel.fromJson(_extract(res.data));
  }

  Future<FieldStopModel> endStop({required String stopId, String? notes}) async {
    final res = await _dio.post(
      '/fieldStops.end',
      data: jsonEncode({
        'json': {
          'stopId': stopId,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return FieldStopModel.fromJson(_extract(res.data));
  }

  Future<AttendanceRecord> markAttendance({
    required AttendanceStatus status,
    String? note,
    String? date,
    String? userId,
  }) async {
    final res = await _dio.post(
      '/fieldAttendance.mark',
      data: jsonEncode({
        'json': {
          'status': status.apiValue,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          if (date != null) 'date': date,
          if (userId != null) 'userId': userId,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return AttendanceRecord.fromJson(_extract(res.data));
  }

  Future<List<AttendanceRecord>> attendanceList({
    String? userId,
    String? from,
    String? to,
    String? status,
    int limit = 100,
  }) async {
    final res = await _dio.get('/fieldAttendance.list', queryParameters: {
      'input': jsonEncode({
        'json': {
          if (userId != null) 'userId': userId,
          if (from != null) 'from': from,
          if (to != null) 'to': to,
          if (status != null) 'status': status,
          'limit': limit,
        }
      }),
    });
    return _extractList(res.data)
        .map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<AttendanceRecord> patchAttendance({
    required String id,
    AttendanceStatus? status,
    String? note,
  }) async {
    final res = await _dio.post(
      '/fieldAttendance.patch',
      data: jsonEncode({
        'json': {
          'id': id,
          if (status != null) 'status': status.apiValue,
          if (note != null) 'note': note,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return AttendanceRecord.fromJson(_extract(res.data));
  }

  Future<List<AgentLite>> listAgents({String? q}) async {
    final res = await _dio.get('/users.list', queryParameters: {
      'input': jsonEncode({
        'json': {
          'limit': 100,
          if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          'isActive': true,
        }
      }),
    });
    return _extractList(res.data)
        .map((e) => AgentLite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ShiftSchedule?> getMySchedule() async {
    final res = await _dio.get('/fieldSchedule.me', queryParameters: {
      'input': jsonEncode({'json': {}}),
    });
    final inner = _extractRaw(res.data);
    if (inner == null) return null;
    return ShiftSchedule.fromJson(inner as Map<String, dynamic>);
  }

  Future<ShiftSchedule> upsertMySchedule({
    required String autoStartTime,
    String timezone = 'Asia/Kolkata',
    bool isEnabled = true,
  }) async {
    final res = await _dio.post(
      '/fieldSchedule.upsertMe',
      data: jsonEncode({
        'json': {
          'autoStartTime': autoStartTime,
          'timezone': timezone,
          'isEnabled': isEnabled,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return ShiftSchedule.fromJson(_extract(res.data));
  }

  Future<TrailSnapshot> trailForShift(String shiftId) async {
    final res = await _dio.get('/fieldLocation.trail', queryParameters: {
      'input': jsonEncode({
        'json': {
          'shiftId': shiftId,
          'simplifyTolerance': 5,
          'maxPoints': 1000,
        }
      }),
    });
    return TrailSnapshot.fromJson(_extract(res.data));
  }

  Future<LocationSyncAck> ingestLocationsV2({
    required String clientShiftId,
    required String serverShiftId,
    required String deviceId,
    required List<Map<String, dynamic>> points,
  }) async {
    final res = await _dio.post(
      '/fieldLocation.ingestV2',
      data: jsonEncode({
        'json': {
          'clientShiftId': clientShiftId,
          'shiftId': serverShiftId,
          'deviceId': deviceId,
          'points': points,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return LocationSyncAck.fromJson(_extract(res.data));
  }

}

final fieldRepositoryProvider = Provider<FieldRepository>((ref) {
  return FieldRepository(ref.watch(dioProvider));
});
