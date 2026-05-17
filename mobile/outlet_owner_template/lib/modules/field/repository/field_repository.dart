import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../models/attendance.dart';
import '../models/field_visit.dart';
import '../models/shift.dart';

// ── location point used for batched ingest ───────────────────────────────────

class LocationPoint {
  const LocationPoint({
    required this.lat,
    required this.lng,
    required this.accuracy,
    required this.recordedAt,
  });

  final double lat;
  final double lng;
  final double accuracy;
  final DateTime recordedAt;

  Map<String, dynamic> toJson() => {
        'lat': lat,
        'lng': lng,
        'accuracy': accuracy,
        // zod validates .datetime() — must be full ISO-8601 with time zone
        'recordedAt': recordedAt.toUtc().toIso8601String(),
      };
}

// ── repository ───────────────────────────────────────────────────────────────

class FieldRepository {
  FieldRepository(this._dio);

  final Dio _dio;

  // Unwrap tRPC response envelope: [{result:{data:{json:...}}}] or {result:...}
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

  List<dynamic> _extractList(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) {
        final inner = first['result']?['data']?['json'];
        if (inner is List) return inner;
      }
    }
    if (raw is Map<String, dynamic>) {
      final inner = raw['result']?['data']?['json'];
      if (inner is List) return inner;
    }
    return [];
  }

  // ── shifts ────────────────────────────────────────────────────────────────

  /// Returns the newly started [Shift]. Throws if shift already active.
  Future<Shift> startShift() async {
    final res = await _dio.post(
      '/fieldShifts.start',
      data: jsonEncode({'json': <String, dynamic>{}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return Shift.fromJson(_extract(res.data));
  }

  /// Ends the current active shift. Throws if no active shift.
  Future<Shift> endShift() async {
    final res = await _dio.post(
      '/fieldShifts.end',
      data: jsonEncode({'json': <String, dynamic>{}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return Shift.fromJson(_extract(res.data));
  }

  /// Marks the current shift as extended (prevents auto-close).
  Future<Shift> extendShift() async {
    final res = await _dio.post(
      '/fieldShifts.extend',
      data: jsonEncode({'json': <String, dynamic>{}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return Shift.fromJson(_extract(res.data));
  }

  /// Returns the current active shift, or null if none.
  Future<Shift?> activeShift() async {
    final res = await _dio.get(
      '/fieldShifts.active',
      queryParameters: {'input': '{"json":{}}'},
    );
    // Backend returns json:null when no active shift
    dynamic inner;
    if (res.data is List && (res.data as List).isNotEmpty) {
      final first = (res.data as List).first;
      if (first is Map<String, dynamic>) {
        inner = first['result']?['data']?['json'];
      }
    } else if (res.data is Map<String, dynamic>) {
      inner = (res.data as Map<String, dynamic>)['result']?['data']?['json'];
    }
    if (inner == null) return null;
    return Shift.fromJson(inner as Map<String, dynamic>);
  }

  // ── location ingest ───────────────────────────────────────────────────────

  /// Ingests a batch of location points. The backend accepts 1–500 per call.
  /// This method automatically chunks batches > 500.
  Future<void> ingestLocations(List<LocationPoint> points) async {
    if (points.isEmpty) return;
    // Chunk into batches of max 500 (backend hard limit)
    const maxBatch = 500;
    for (var i = 0; i < points.length; i += maxBatch) {
      final chunk = points.sublist(
          i, i + maxBatch > points.length ? points.length : i + maxBatch);
      await _dio.post(
        '/fieldLocation.ingest',
        data: jsonEncode({
          'json': {
            'locations': chunk.map((p) => p.toJson()).toList(),
          },
        }),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
    }
  }

  // ── visits ────────────────────────────────────────────────────────────────

  /// Logs a field visit at the current GPS position.
  /// [recordedAt] defaults to now if not supplied.
  Future<FieldVisit> logVisit({
    required double lat,
    required double lng,
    String? description,
    String? audioUrl,
    DateTime? recordedAt,
  }) async {
    final payload = <String, dynamic>{
      'lat': lat,
      'lng': lng,
      if (description != null && description.isNotEmpty)
        'description': description,
      if (audioUrl != null) 'audioUrl': audioUrl,
      // recordedAt is optional on backend — pass it explicitly for accuracy
      'recordedAt':
          (recordedAt ?? DateTime.now()).toUtc().toIso8601String(),
    };
    final res = await _dio.post(
      '/fieldVisits.log',
      data: jsonEncode({'json': payload}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return FieldVisit.fromJson(_extract(res.data));
  }

  /// Returns all visits for a given shift.
  Future<List<FieldVisit>> visitsForShift(String shiftId) async {
    final res = await _dio.get(
      '/fieldVisits.forShift',
      queryParameters: {
        'input': jsonEncode({'json': {'shiftId': shiftId}}),
      },
    );
    return _extractList(res.data)
        .map((e) => FieldVisit.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── attendance ────────────────────────────────────────────────────────────

  /// Marks today's attendance for the current user.
  Future<DailyAttendance> markAttendance({
    required AttendanceStatus status,
    String? note,
    String? date, // YYYY-MM-DD; defaults to today on backend
  }) async {
    final payload = <String, dynamic>{
      'status': status.value,
      if (note != null && note.isNotEmpty) 'note': note,
      if (date != null) 'date': date,
    };
    final res = await _dio.post(
      '/fieldAttendance.mark',
      data: jsonEncode({'json': payload}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return DailyAttendance.fromJson(_extract(res.data));
  }

  /// Returns attendance records for the current user.
  /// [from] and [to] must be full ISO-8601 datetime strings when provided,
  /// because the zod schema uses .datetime() not .date().
  Future<List<DailyAttendance>> listAttendance({
    String? from,
    String? to,
    int limit = 30,
  }) async {
    final params = <String, dynamic>{'limit': limit};
    if (from != null) params['from'] = from;
    if (to != null) params['to'] = to;

    final res = await _dio.get(
      '/fieldAttendance.list',
      queryParameters: {'input': jsonEncode({'json': params})},
    );
    return _extractList(res.data)
        .map((e) => DailyAttendance.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final fieldRepositoryProvider = Provider<FieldRepository>((ref) {
  return FieldRepository(ref.watch(dioProvider));
});
