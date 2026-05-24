import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'local_models.dart';

// ── FieldLocalStore ───────────────────────────────────────────────────────────
// Singleton SQLite store. Safe to instantiate in background isolates —
// sqflite serialises concurrent writes internally.

class FieldLocalStore {
  FieldLocalStore._();
  static final FieldLocalStore instance = FieldLocalStore._();

  Database? _db;

  Future<Database> get _database async {
    _db ??= await _open();
    return _db!;
  }

  Future<Database> _open() async {
    final dir = await getDatabasesPath();
    final path = p.join(dir, 'field_sense.db');
    return openDatabase(
      path,
      version: 1,
      onCreate: _onCreate,
      onUpgrade: (db, oldVersion, newVersion) async {
        // Future migrations will go here.
        // Example: if (oldVersion < 2) { await db.execute('ALTER TABLE ...'); }
      },
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE local_field_shifts (
        clientShiftId TEXT PRIMARY KEY,
        serverShiftId TEXT,
        status TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        startSyncedAt TEXT,
        endSyncedAt TEXT,
        lastErrorCode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE local_location_points (
        clientPointId TEXT PRIMARY KEY,
        clientShiftId TEXT NOT NULL,
        serverShiftId TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy REAL NOT NULL,
        recordedAt TEXT NOT NULL,
        capturedAt TEXT NOT NULL,
        source TEXT NOT NULL,
        altitude REAL,
        speed REAL,
        heading REAL,
        isMocked INTEGER,
        syncStatus TEXT NOT NULL,
        syncAttempts INTEGER NOT NULL DEFAULT 0,
        lastErrorCode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');

    await db.execute(
        'CREATE INDEX idx_llp_shift ON local_location_points (clientShiftId)');
    await db.execute(
        'CREATE INDEX idx_llp_sync ON local_location_points (syncStatus)');

    await db.execute('''
      CREATE TABLE local_field_events (
        clientEventId TEXT PRIMARY KEY,
        clientShiftId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        syncStatus TEXT NOT NULL,
        syncAttempts INTEGER NOT NULL DEFAULT 0,
        lastErrorCode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');
  }

  // ── shifts ────────────────────────────────────────────────────────────────

  Future<LocalShift> createShift({
    required String clientShiftId,
    required String startedAt,
  }) async {
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    final shift = LocalShift(
      clientShiftId: clientShiftId,
      status: LocalShiftStatus.localActive,
      startedAt: startedAt,
      createdAt: now,
      updatedAt: now,
    );
    await db.insert('local_field_shifts', shift.toMap(),
        conflictAlgorithm: ConflictAlgorithm.ignore);
    return shift;
  }

  Future<LocalShift?> getActiveLocalShift() async {
    final db = await _database;
    final rows = await db.query(
      'local_field_shifts',
      where: "status NOT IN ('completed', 'conflict')",
      orderBy: 'createdAt DESC',
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return LocalShift.fromMap(rows.first);
  }

  Future<LocalShift?> getShiftByClientId(String clientShiftId) async {
    final db = await _database;
    final rows = await db.query(
      'local_field_shifts',
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return LocalShift.fromMap(rows.first);
  }

  Future<void> updateShiftAfterSyncStart({
    required String clientShiftId,
    required String serverShiftId,
  }) async {
    final db = await _database;
    await db.update(
      'local_field_shifts',
      {
        'serverShiftId': serverShiftId,
        'status': LocalShiftStatus.serverActive.value,
        'startSyncedAt': DateTime.now().toUtc().toIso8601String(),
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
    // Propagate serverShiftId to pending points for this shift.
    await db.update(
      'local_location_points',
      {'serverShiftId': serverShiftId},
      where: 'clientShiftId = ? AND serverShiftId IS NULL',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> updateShiftStatus({
    required String clientShiftId,
    required LocalShiftStatus status,
    String? lastErrorCode,
  }) async {
    final db = await _database;
    await db.update(
      'local_field_shifts',
      {
        'status': status.value,
        if (lastErrorCode != null) 'lastErrorCode': lastErrorCode,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> markShiftEndingPending({
    required String clientShiftId,
    required String endedAt,
  }) async {
    final db = await _database;
    await db.update(
      'local_field_shifts',
      {
        'status': LocalShiftStatus.endingPending.value,
        'endedAt': endedAt,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> completeShift({
    required String clientShiftId,
    required String endedAt,
  }) async {
    final db = await _database;
    await db.update(
      'local_field_shifts',
      {
        'status': LocalShiftStatus.completed.value,
        'endedAt': endedAt,
        'endSyncedAt': DateTime.now().toUtc().toIso8601String(),
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  // ── location points ───────────────────────────────────────────────────────

  Future<void> insertLocationPoint(LocalLocationPoint point) async {
    final db = await _database;
    await db.insert('local_location_points', point.toMap(),
        conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  Future<List<LocalLocationPoint>> getPendingPoints({
    required String clientShiftId,
    int limit = 200,
  }) async {
    final db = await _database;
    final rows = await db.query(
      'local_location_points',
      where: "clientShiftId = ? AND syncStatus IN ('pending', 'in_flight')",
      whereArgs: [clientShiftId],
      orderBy: 'recordedAt ASC',
      limit: limit,
    );
    return rows.map(LocalLocationPoint.fromMap).toList();
  }

  Future<int> countPendingPoints(String clientShiftId) async {
    final db = await _database;
    final result = await db.rawQuery(
      "SELECT COUNT(*) as c FROM local_location_points WHERE clientShiftId = ? AND syncStatus IN ('pending', 'in_flight')",
      [clientShiftId],
    );
    return (result.first['c'] as int?) ?? 0;
  }

  Future<void> markPointsInFlight(List<String> clientPointIds) async {
    if (clientPointIds.isEmpty) return;
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    final placeholders = List.filled(clientPointIds.length, '?').join(',');
    await db.rawUpdate(
      "UPDATE local_location_points SET syncStatus = 'in_flight', syncAttempts = syncAttempts + 1, updatedAt = ? WHERE clientPointId IN ($placeholders)",
      [now, ...clientPointIds],
    );
  }

  Future<void> markPointsAcked(List<String> clientPointIds) async {
    if (clientPointIds.isEmpty) return;
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    final placeholders = List.filled(clientPointIds.length, '?').join(',');
    await db.rawUpdate(
      "UPDATE local_location_points SET syncStatus = 'acked', updatedAt = ? WHERE clientPointId IN ($placeholders)",
      [now, ...clientPointIds],
    );
  }

  Future<void> markPointsRejected({
    required String clientPointId,
    required String reason,
  }) async {
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    await db.update(
      'local_location_points',
      {
        'syncStatus': SyncStatus.rejected.value,
        'lastErrorCode': reason,
        'updatedAt': now,
      },
      where: 'clientPointId = ?',
      whereArgs: [clientPointId],
    );
  }

  Future<void> resetInFlightToPending(String clientShiftId) async {
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    await db.rawUpdate(
      "UPDATE local_location_points SET syncStatus = 'pending', updatedAt = ? WHERE clientShiftId = ? AND syncStatus = 'in_flight'",
      [now, clientShiftId],
    );
  }

  // ── field events ──────────────────────────────────────────────────────────

  Future<void> insertEvent(LocalFieldEvent event) async {
    final db = await _database;
    await db.insert('local_field_events', event.toMap(),
        conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  Future<List<LocalFieldEvent>> getPendingEvents(String clientShiftId) async {
    final db = await _database;
    final rows = await db.query(
      'local_field_events',
      where: "clientShiftId = ? AND syncStatus IN ('pending', 'in_flight')",
      whereArgs: [clientShiftId],
      orderBy: 'createdAt ASC',
    );
    return rows.map(LocalFieldEvent.fromMap).toList();
  }

  Future<void> markEventAcked(String clientEventId) async {
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    await db.update(
      'local_field_events',
      {'syncStatus': SyncStatus.acked.value, 'updatedAt': now},
      where: 'clientEventId = ?',
      whereArgs: [clientEventId],
    );
  }
}
