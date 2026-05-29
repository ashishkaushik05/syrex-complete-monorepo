import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/network/api_client.dart';

class ShiftData {
  final String id;
  final String status;
  final DateTime startTime;
  final DateTime? endTime;
  final String? clientShiftId;

  const ShiftData({
    required this.id,
    required this.status,
    required this.startTime,
    this.endTime,
    this.clientShiftId,
  });

  factory ShiftData.fromJson(Map<String, dynamic> j) => ShiftData(
    id: j['id'] as String,
    status: j['status'] as String,
    startTime: DateTime.parse(j['startTime'] as String),
    endTime: j['endTime'] != null ? DateTime.parse(j['endTime'] as String) : null,
    clientShiftId: j['clientShiftId'] as String?,
  );
}

class VisitData {
  final String id;
  final String outletName;
  final String visitType;
  final DateTime createdAt;
  final String? notes;
  final String? shiftId;

  const VisitData({
    required this.id,
    required this.outletName,
    required this.visitType,
    required this.createdAt,
    this.notes,
    this.shiftId,
  });

  factory VisitData.fromJson(Map<String, dynamic> j) => VisitData(
    id: j['id'] as String,
    outletName: j['outletName'] as String? ?? 'Unknown outlet',
    visitType: j['visitType'] as String? ?? 'delivery',
    createdAt: DateTime.parse(j['createdAt'] as String),
    notes: j['notes'] as String?,
    shiftId: j['shiftId'] as String?,
  );
}

class StopData {
  final String id;
  final String reason;
  final String status;
  final DateTime startTime;
  final DateTime? endTime;

  const StopData({
    required this.id,
    required this.reason,
    required this.status,
    required this.startTime,
    this.endTime,
  });

  factory StopData.fromJson(Map<String, dynamic> j) => StopData(
    id: j['id'] as String,
    reason: j['reason'] as String? ?? 'Other',
    status: j['status'] as String,
    startTime: DateTime.parse(j['startTime'] as String),
    endTime: j['endTime'] != null ? DateTime.parse(j['endTime'] as String) : null,
  );
}

class FieldClient {
  FieldClient(this._dio);
  final Dio _dio;

  // Shifts
  Future<ShiftData?> activeShift() async {
    try {
      final res = await _dio.get(
        '/trpc/fieldShifts.active',
        queryParameters: {'input': jsonEncode({'json': {}})},
      );
      final data = (res.data as List).first['result']['data']['json'];
      if (data == null) return null;
      return ShiftData.fromJson(data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<ShiftData> startShift() async {
    final clientShiftId = DateTime.now().millisecondsSinceEpoch.toString();
    final res = await _dio.post(
      '/trpc/fieldShifts.start',
      data: jsonEncode({'json': {'clientShiftId': clientShiftId}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    final data = (res.data as List).first['result']['data']['json'];
    return ShiftData.fromJson(data as Map<String, dynamic>);
  }

  Future<void> endShift(String shiftId) async {
    await _dio.post(
      '/trpc/fieldShifts.end',
      data: jsonEncode({'json': {'shiftId': shiftId}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
  }

  Future<List<VisitData>> listVisits({String? shiftId}) async {
    final input = {if (shiftId != null) 'shiftId': shiftId};
    final res = await _dio.get(
      '/trpc/fieldVisits.list',
      queryParameters: {'input': jsonEncode({'json': input})},
    );
    final data = (res.data as List).first['result']['data']['json'];
    return (data as List)
        .map((e) => VisitData.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> logVisit({
    required String outletId,
    required String visitType,
    String? notes,
    String? shiftId,
  }) async {
    await _dio.post(
      '/trpc/fieldVisits.log',
      data: jsonEncode({
        'json': {
          'outletId': outletId,
          'visitType': visitType,
          if (notes != null) 'notes': notes,
          if (shiftId != null) 'shiftId': shiftId,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
  }

  Future<StopData?> activeStop() async {
    try {
      final res = await _dio.get(
        '/trpc/fieldStops.active',
        queryParameters: {'input': jsonEncode({'json': {}})},
      );
      final data = (res.data as List).first['result']['data']['json'];
      if (data == null) return null;
      return StopData.fromJson(data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<StopData> startStop({required String reason}) async {
    final res = await _dio.post(
      '/trpc/fieldStops.start',
      data: jsonEncode({'json': {'reason': reason}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    final data = (res.data as List).first['result']['data']['json'];
    return StopData.fromJson(data as Map<String, dynamic>);
  }

  Future<void> endStop(String stopId) async {
    await _dio.post(
      '/trpc/fieldStops.end',
      data: jsonEncode({'json': {'stopId': stopId}}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
  }
}

final fieldClientProvider = Provider<FieldClient>(
  (ref) => FieldClient(ref.watch(dioProvider)),
);

final activeShiftProvider = FutureProvider.autoDispose<ShiftData?>((ref) async {
  return ref.watch(fieldClientProvider).activeShift();
});

final activeStopProvider = FutureProvider.autoDispose<StopData?>((ref) async {
  return ref.watch(fieldClientProvider).activeStop();
});

final shiftVisitsProvider = FutureProvider.autoDispose.family<List<VisitData>, String?>(
  (ref, shiftId) async {
    return ref.watch(fieldClientProvider).listVisits(shiftId: shiftId);
  },
);
