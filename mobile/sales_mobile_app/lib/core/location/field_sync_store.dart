import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../storage/token_store.dart';

class ActiveFieldShift {
  const ActiveFieldShift({
    required this.clientShiftId,
    required this.serverShiftId,
  });

  final String clientShiftId;
  final String serverShiftId;
}

class FieldSyncStore {
  FieldSyncStore(this._storage);

  static const activeClientShiftIdKey = 'field_active_client_shift_id';
  static const activeServerShiftIdKey = 'field_active_server_shift_id';
  static const pendingPointsKey = 'field_pending_points_v2';
  static const deviceIdKey = 'field_device_id';

  static const maxPendingPoints = 5000;

  final FlutterSecureStorage _storage;

  Future<String> getOrCreateDeviceId() async {
    final existing = await _storage.read(key: deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final generated = _newLocalId('device');
    await _storage.write(key: deviceIdKey, value: generated);
    return generated;
  }

  Future<ActiveFieldShift?> readActiveShift() async {
    final clientShiftId = await _storage.read(key: activeClientShiftIdKey);
    final serverShiftId = await _storage.read(key: activeServerShiftIdKey);
    if (clientShiftId == null ||
        clientShiftId.isEmpty ||
        serverShiftId == null ||
        serverShiftId.isEmpty) {
      return null;
    }
    return ActiveFieldShift(
      clientShiftId: clientShiftId,
      serverShiftId: serverShiftId,
    );
  }

  Future<void> saveActiveShift({
    required String clientShiftId,
    required String serverShiftId,
  }) async {
    await _storage.write(key: activeClientShiftIdKey, value: clientShiftId);
    await _storage.write(key: activeServerShiftIdKey, value: serverShiftId);
  }

  Future<void> clearActiveShift() async {
    await _storage.delete(key: activeClientShiftIdKey);
    await _storage.delete(key: activeServerShiftIdKey);
  }

  Future<List<Map<String, dynamic>>> readPendingPoints() async {
    return readPendingPointsFrom(_storage);
  }

  Future<void> writePendingPoints(List<Map<String, dynamic>> points) async {
    await writePendingPointsTo(_storage, points);
  }

  Future<void> appendPendingPoints(List<Map<String, dynamic>> points) async {
    final existing = await readPendingPoints();
    await writePendingPoints([...existing, ...points]);
  }

  static String newClientShiftId(String deviceId) {
    return _newLocalId('shift_$deviceId');
  }

  static String newClientPointId(String deviceId) {
    return _newLocalId('point_$deviceId');
  }

  static Future<List<Map<String, dynamic>>> readPendingPointsFrom(
    FlutterSecureStorage storage,
  ) async {
    final raw = await storage.read(key: pendingPointsKey);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((entry) => entry.map((key, value) => MapEntry('$key', value)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  static Future<void> writePendingPointsTo(
    FlutterSecureStorage storage,
    List<Map<String, dynamic>> points,
  ) async {
    if (points.length > maxPendingPoints) {
      debugPrint('[FieldSyncStore] WARNING: queue full (${points.length}), dropping oldest ${points.length - maxPendingPoints} points');
    }
    final bounded = points.length > maxPendingPoints
        ? points.sublist(points.length - maxPendingPoints)
        : points;
    if (bounded.isEmpty) {
      await storage.delete(key: pendingPointsKey);
      return;
    }
    await storage.write(key: pendingPointsKey, value: jsonEncode(bounded));
  }

  static String _newLocalId(String prefix) {
    final random = Random.secure().nextInt(1 << 32).toRadixString(16);
    return '${prefix}_${DateTime.now().toUtc().microsecondsSinceEpoch}_$random';
  }
}

final fieldSyncStoreProvider = Provider<FieldSyncStore>((ref) {
  return FieldSyncStore(ref.watch(secureStorageProvider));
});
