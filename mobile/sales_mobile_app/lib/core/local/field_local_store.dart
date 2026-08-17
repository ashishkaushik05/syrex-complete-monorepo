import 'dart:async';
import 'dart:convert';

import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

class LocalFieldShift {
  const LocalFieldShift({
    required this.clientShiftId,
    this.serverShiftId,
    required this.status,
    required this.startedAt,
    this.endedAt,
    this.startSyncedAt,
    this.endSyncedAt,
    this.lastErrorCode,
    required this.createdAt,
    required this.updatedAt,
  });

  final String clientShiftId;
  final String? serverShiftId;
  final String status;
  final String startedAt;
  final String? endedAt;
  final String? startSyncedAt;
  final String? endSyncedAt;
  final String? lastErrorCode;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toMap() => {
        'clientShiftId': clientShiftId,
        'serverShiftId': serverShiftId,
        'status': status,
        'startedAt': startedAt,
        'endedAt': endedAt,
        'startSyncedAt': startSyncedAt,
        'endSyncedAt': endSyncedAt,
        'lastErrorCode': lastErrorCode,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  factory LocalFieldShift.fromMap(Map<String, dynamic> m) => LocalFieldShift(
        clientShiftId: m['clientShiftId'] as String,
        serverShiftId: m['serverShiftId'] as String?,
        status: m['status'] as String,
        startedAt: m['startedAt'] as String,
        endedAt: m['endedAt'] as String?,
        startSyncedAt: m['startSyncedAt'] as String?,
        endSyncedAt: m['endSyncedAt'] as String?,
        lastErrorCode: m['lastErrorCode'] as String?,
        createdAt: m['createdAt'] as String,
        updatedAt: m['updatedAt'] as String,
      );

  LocalFieldShift copyWith({
    String? serverShiftId,
    String? status,
    String? endedAt,
    String? startSyncedAt,
    String? endSyncedAt,
    String? lastErrorCode,
    String? updatedAt,
  }) =>
      LocalFieldShift(
        clientShiftId: clientShiftId,
        serverShiftId: serverShiftId ?? this.serverShiftId,
        status: status ?? this.status,
        startedAt: startedAt,
        endedAt: endedAt ?? this.endedAt,
        startSyncedAt: startSyncedAt ?? this.startSyncedAt,
        endSyncedAt: endSyncedAt ?? this.endSyncedAt,
        lastErrorCode: lastErrorCode ?? this.lastErrorCode,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
      );
}

class LocalLocationPoint {
  const LocalLocationPoint({
    required this.clientPointId,
    required this.clientShiftId,
    this.serverShiftId,
    required this.lat,
    required this.lng,
    required this.accuracy,
    required this.recordedAt,
    required this.capturedAt,
    required this.source,
    this.altitude,
    this.speed,
    this.heading,
    this.isMocked,
    required this.syncStatus,
    this.syncAttempts = 0,
    this.lastErrorCode,
    required this.createdAt,
    required this.updatedAt,
  });

  final String clientPointId;
  final String clientShiftId;
  final String? serverShiftId;
  final double lat;
  final double lng;
  final double accuracy;
  final String recordedAt;
  final String capturedAt;
  final String source;
  final double? altitude;
  final double? speed;
  final double? heading;
  final int? isMocked;
  final String syncStatus;
  final int syncAttempts;
  final String? lastErrorCode;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toMap() => {
        'clientPointId': clientPointId,
        'clientShiftId': clientShiftId,
        'serverShiftId': serverShiftId,
        'lat': lat,
        'lng': lng,
        'accuracy': accuracy,
        'recordedAt': recordedAt,
        'capturedAt': capturedAt,
        'source': source,
        'altitude': altitude,
        'speed': speed,
        'heading': heading,
        'isMocked': isMocked,
        'syncStatus': syncStatus,
        'syncAttempts': syncAttempts,
        'lastErrorCode': lastErrorCode,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  factory LocalLocationPoint.fromMap(Map<String, dynamic> m) =>
      LocalLocationPoint(
        clientPointId: m['clientPointId'] as String,
        clientShiftId: m['clientShiftId'] as String,
        serverShiftId: m['serverShiftId'] as String?,
        lat: (m['lat'] as num).toDouble(),
        lng: (m['lng'] as num).toDouble(),
        accuracy: (m['accuracy'] as num).toDouble(),
        recordedAt: m['recordedAt'] as String,
        capturedAt: m['capturedAt'] as String,
        source: m['source'] as String,
        altitude:
            m['altitude'] != null ? (m['altitude'] as num).toDouble() : null,
        speed: m['speed'] != null ? (m['speed'] as num).toDouble() : null,
        heading: m['heading'] != null ? (m['heading'] as num).toDouble() : null,
        isMocked: m['isMocked'] as int?,
        syncStatus: m['syncStatus'] as String,
        syncAttempts: (m['syncAttempts'] as int?) ?? 0,
        lastErrorCode: m['lastErrorCode'] as String?,
        createdAt: m['createdAt'] as String,
        updatedAt: m['updatedAt'] as String,
      );
}

class LocalFieldEvent {
  const LocalFieldEvent({
    required this.clientEventId,
    required this.clientShiftId,
    this.serverShiftId,
    required this.eventType,
    required this.payloadJson,
    required this.syncStatus,
    this.serverId,
    this.syncAttempts = 0,
    this.lastErrorCode,
    required this.createdAt,
    required this.updatedAt,
  });

  final String clientEventId;
  final String clientShiftId;
  final String? serverShiftId;
  final String eventType;
  final String payloadJson;
  final String syncStatus;
  final String? serverId;
  final int syncAttempts;
  final String? lastErrorCode;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toMap() => {
        'clientEventId': clientEventId,
        'clientShiftId': clientShiftId,
        'serverShiftId': serverShiftId,
        'eventType': eventType,
        'payloadJson': payloadJson,
        'syncStatus': syncStatus,
        'serverId': serverId,
        'syncAttempts': syncAttempts,
        'lastErrorCode': lastErrorCode,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  factory LocalFieldEvent.fromMap(Map<String, dynamic> m) => LocalFieldEvent(
        clientEventId: m['clientEventId'] as String,
        clientShiftId: m['clientShiftId'] as String,
        serverShiftId: m['serverShiftId'] as String?,
        eventType: m['eventType'] as String,
        payloadJson: m['payloadJson'] as String,
        syncStatus: m['syncStatus'] as String,
        serverId: m['serverId'] as String?,
        syncAttempts: (m['syncAttempts'] as int?) ?? 0,
        lastErrorCode: m['lastErrorCode'] as String?,
        createdAt: m['createdAt'] as String,
        updatedAt: m['updatedAt'] as String,
      );
}

// ---------------------------------------------------------------------------
// Status constants
// ---------------------------------------------------------------------------

/// Shift status values (matches MOBILE_CANONICAL_RUNTIME.md + OFFLINE_SYNC_SPEC.md).
abstract class ShiftStatus {
  static const localActive = 'local_active';
  static const syncingStart = 'syncing_start';
  static const serverActive = 'server_active';
  static const endingPending = 'ending_pending';
  static const completed = 'completed';
  static const conflict = 'conflict';
  static const startFailedRetryable = 'start_failed_retryable';
  static const endFailedRetryable = 'end_failed_retryable';

  /// Statuses that count as "active" for recovery purposes.
  static const activeStatuses = [
    localActive,
    syncingStart,
    serverActive,
    endingPending,
    startFailedRetryable,
    endFailedRetryable,
  ];
}

/// Point sync status values.
abstract class PointSyncStatus {
  static const pending = 'pending';
  static const inFlight = 'in_flight';
  static const acked = 'acked';
  static const duplicate = 'duplicate';
  static const rejected = 'rejected';
  static const failed = 'failed';
}

/// Event sync status values.
abstract class EventSyncStatus {
  static const pending = 'pending';
  static const inFlight = 'in_flight';
  static const acked = 'acked';
  static const rejected = 'rejected';
  static const failed = 'failed';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class FieldLocalStore {
  FieldLocalStore._(this._db);

  final Database _db;

  static const _dbName = 'field_sense.db';
  static const _dbVersion = 2;

  // P0-3: Maximum pending (unsynced) location points before oldest are pruned.
  static const maxLocalLocationQueue = 50000;
  // P0-2: Lease TTL — in-flight points not acked within this window are reset to pending.
  static const _leaseTtlSeconds = 30;

  static FieldLocalStore? _instance;
  static Completer<FieldLocalStore>? _openCompleter;

  /// Returns a singleton. Safe to call concurrently — opens only once.
  /// Concurrent callers wait on the same [Completer] rather than racing to
  /// open the database a second time.
  static Future<FieldLocalStore> open() async {
    if (_instance != null) return _instance!;
    if (_openCompleter != null) return _openCompleter!.future;
    _openCompleter = Completer<FieldLocalStore>();
    try {
      final dbPath = p.join(await getDatabasesPath(), _dbName);
      final db = await openDatabase(
        dbPath,
        version: _dbVersion,
        onCreate: _onCreate,
        onUpgrade: _onUpgrade,
        onOpen: (db) async {
          // P0-2: WAL mode prevents background/foreground isolate write contention.
          await db.rawQuery('PRAGMA journal_mode=WAL');
          await db.rawQuery('PRAGMA busy_timeout=5000');
        },
      );
      _instance = FieldLocalStore._(db);
      _openCompleter!.complete(_instance!);
      return _instance!;
    } catch (e, st) {
      final c = _openCompleter!;
      _openCompleter = null; // allow retry after error
      c.completeError(e, st);
      rethrow;
    }
  }

  static Future<void> _onUpgrade(
      Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      // P0-2: Add lease timestamp for transactional batch claiming.
      await db
          .execute('ALTER TABLE local_location_points ADD COLUMN leaseAt TEXT');
    }
  }

  static Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS local_field_shifts (
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
      CREATE TABLE IF NOT EXISTS local_location_points (
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
        leaseAt TEXT,
        lastErrorCode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_location_points_clientShiftId
        ON local_location_points (clientShiftId)
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS local_field_events (
        clientEventId TEXT PRIMARY KEY,
        clientShiftId TEXT NOT NULL,
        serverShiftId TEXT,
        eventType TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        syncStatus TEXT NOT NULL,
        serverId TEXT,
        syncAttempts INTEGER NOT NULL DEFAULT 0,
        lastErrorCode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_local_field_events_clientShiftId
        ON local_field_events (clientShiftId)
    ''');
  }

  // -------------------------------------------------------------------------
  // Shift CRUD
  // -------------------------------------------------------------------------

  Future<void> insertShift(LocalFieldShift shift) async {
    await _db.insert(
      'local_field_shifts',
      shift.toMap(),
      conflictAlgorithm: ConflictAlgorithm.fail,
    );
  }

  /// Returns the shift whose status is one of the active statuses, if any.
  Future<LocalFieldShift?> getActiveShift() async {
    final placeholders = ShiftStatus.activeStatuses.map((_) => '?').join(', ');
    final rows = await _db.query(
      'local_field_shifts',
      where: 'status IN ($placeholders)',
      whereArgs: ShiftStatus.activeStatuses,
      orderBy: 'createdAt DESC',
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return LocalFieldShift.fromMap(rows.first);
  }

  Future<void> updateShiftStatus(String clientShiftId, String status) async {
    await _db.update(
      'local_field_shifts',
      {
        'status': status,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> updateShiftServerIds(
    String clientShiftId,
    String serverShiftId, {
    String? startSyncedAt,
  }) async {
    await _db.update(
      'local_field_shifts',
      {
        'serverShiftId': serverShiftId,
        if (startSyncedAt != null) 'startSyncedAt': startSyncedAt,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> updateShiftEndedAt(String clientShiftId, String endedAt) async {
    await _db.update(
      'local_field_shifts',
      {
        'endedAt': endedAt,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> updateShiftEndSynced(
      String clientShiftId, String endSyncedAt) async {
    await _db.update(
      'local_field_shifts',
      {
        'endSyncedAt': endSyncedAt,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> updateShiftError(String clientShiftId, String errorCode) async {
    await _db.update(
      'local_field_shifts',
      {
        'lastErrorCode': errorCode,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  Future<void> clearShiftError(String clientShiftId) async {
    await _db.update(
      'local_field_shifts',
      {
        'lastErrorCode': null,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
    );
  }

  // -------------------------------------------------------------------------
  // Point CRUD
  // -------------------------------------------------------------------------

  Future<void> insertPoint(LocalLocationPoint point) async {
    await _db.insert(
      'local_location_points',
      point.toMap(),
      conflictAlgorithm: ConflictAlgorithm.fail,
    );
  }

  /// Returns up to [limit] pending points for [clientShiftId], ordered by
  /// recordedAt ascending (stable upload order).
  Future<List<LocalLocationPoint>> getPendingPoints(
    String clientShiftId, {
    int limit = 500,
  }) async {
    final rows = await _db.query(
      'local_location_points',
      where: 'clientShiftId = ? AND syncStatus = ?',
      whereArgs: [clientShiftId, PointSyncStatus.pending],
      orderBy: 'recordedAt ASC',
      limit: limit,
    );
    return rows.map(LocalLocationPoint.fromMap).toList();
  }

  Future<int> getPendingPointCount(String clientShiftId) async {
    final result = await _db.rawQuery(
      'SELECT COUNT(*) as cnt FROM local_location_points '
      'WHERE clientShiftId = ? AND syncStatus = ?',
      [clientShiftId, PointSyncStatus.pending],
    );
    return (result.first['cnt'] as int?) ?? 0;
  }

  Future<void> markPointsInFlight(List<String> clientPointIds) async {
    if (clientPointIds.isEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final id in clientPointIds) {
      batch.rawUpdate(
        'UPDATE local_location_points '
        'SET syncStatus = ?, syncAttempts = syncAttempts + 1, leaseAt = ?, updatedAt = ? '
        'WHERE clientPointId = ?',
        [PointSyncStatus.inFlight, now, now, id],
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> markPointsAcked(List<String> clientPointIds) async {
    if (clientPointIds.isEmpty) return;
    await _batchUpdatePointStatus(clientPointIds, PointSyncStatus.acked);
  }

  Future<void> markPointsDuplicate(List<String> clientPointIds) async {
    if (clientPointIds.isEmpty) return;
    await _batchUpdatePointStatus(clientPointIds, PointSyncStatus.duplicate);
  }

  Future<void> markPointsRejected(List<Map<String, String>> rejections) async {
    if (rejections.isEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final r in rejections) {
      batch.update(
        'local_location_points',
        {
          'syncStatus': PointSyncStatus.rejected,
          'lastErrorCode': r['reason'],
          'updatedAt': now,
        },
        where: 'clientPointId = ?',
        whereArgs: [r['clientPointId']],
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> markPointsFailed(
      List<String> clientPointIds, String reason) async {
    if (clientPointIds.isEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final id in clientPointIds) {
      batch.update(
        'local_location_points',
        {
          'syncStatus': PointSyncStatus.failed,
          'lastErrorCode': reason,
          'updatedAt': now,
        },
        where: 'clientPointId = ?',
        whereArgs: [id],
      );
    }
    await batch.commit(noResult: true);
  }

  /// Resets all in-flight points for a shift back to pending.
  /// Call this on app startup to recover from a previous crash.
  Future<void> resetInflightToPending(String clientShiftId) async {
    await _db.update(
      'local_location_points',
      {
        'syncStatus': PointSyncStatus.pending,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ? AND syncStatus = ?',
      whereArgs: [clientShiftId, PointSyncStatus.inFlight],
    );
  }

  /// P0-2: Resets in-flight points whose lease has expired back to pending.
  /// Protects against a sync tick dying mid-batch without resetting its points.
  Future<void> resetExpiredLeases(String clientShiftId) async {
    final cutoff = DateTime.now()
        .toUtc()
        .subtract(const Duration(seconds: _leaseTtlSeconds))
        .toIso8601String();
    await _db.update(
      'local_location_points',
      {
        'syncStatus': PointSyncStatus.pending,
        'leaseAt': null,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where:
          'clientShiftId = ? AND syncStatus = ? AND (leaseAt IS NULL OR leaseAt < ?)',
      whereArgs: [clientShiftId, PointSyncStatus.inFlight, cutoff],
    );
  }

  /// P0-3: Enforces a cap on pending location points. When the queue exceeds
  /// [maxLocalLocationQueue], the oldest unsynced points are deleted and a
  /// QUEUE_OVERFLOW event is written for the diagnostics screen.
  ///
  /// Returns the number of points dropped (0 if no overflow).
  Future<int> enforceQueueCap(String clientShiftId) async {
    final result = await _db.rawQuery(
      'SELECT COUNT(*) as cnt FROM local_location_points '
      'WHERE clientShiftId = ? AND syncStatus = ?',
      [clientShiftId, PointSyncStatus.pending],
    );
    final count = (result.first['cnt'] as int?) ?? 0;
    if (count <= maxLocalLocationQueue) return 0;

    final overflow = count - maxLocalLocationQueue;
    final toDelete = await _db.rawQuery(
      'SELECT clientPointId, recordedAt FROM local_location_points '
      'WHERE clientShiftId = ? AND syncStatus = ? '
      'ORDER BY recordedAt ASC LIMIT ?',
      [clientShiftId, PointSyncStatus.pending, overflow],
    );
    if (toDelete.isEmpty) return 0;

    final oldestTs = toDelete.first['recordedAt'] as String;
    final newestTs = toDelete.last['recordedAt'] as String;
    final ids = toDelete.map((r) => r['clientPointId'] as String).toList();

    final batch = _db.batch();
    for (final id in ids) {
      batch.delete('local_location_points',
          where: 'clientPointId = ?', whereArgs: [id]);
    }
    await batch.commit(noResult: true);

    // Use ids.length — actual deleted rows, not the pre-computed overflow value
    // which may diverge if concurrent inserts happened between count and delete.
    final dropped = ids.length;
    final now = DateTime.now().toUtc().toIso8601String();
    final safeTs = now.replaceAll(':', '-');
    await _db.insert(
      'local_field_events',
      {
        'clientEventId': '${clientShiftId}_overflow_$safeTs',
        'clientShiftId': clientShiftId,
        'eventType': 'queue_overflow',
        'payloadJson': jsonEncode({
          'droppedCount': dropped,
          'oldestDroppedAt': oldestTs,
          'newestDroppedAt': newestTs,
          'activeClientShiftId': clientShiftId,
        }),
        'syncStatus': EventSyncStatus.pending,
        'syncAttempts': 0,
        'createdAt': now,
        'updatedAt': now,
      },
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );

    return dropped;
  }

  // -------------------------------------------------------------------------
  // Event CRUD
  // -------------------------------------------------------------------------

  Future<void> insertEvent(LocalFieldEvent event) async {
    await _db.insert(
      'local_field_events',
      event.toMap(),
      conflictAlgorithm: ConflictAlgorithm.fail,
    );
  }

  /// Returns up to [limit] pending events for [clientShiftId], ordered by
  /// createdAt ascending.
  Future<List<LocalFieldEvent>> getPendingEvents(
    String clientShiftId, {
    int limit = 50,
  }) async {
    final rows = await _db.query(
      'local_field_events',
      where: 'clientShiftId = ? AND syncStatus = ?',
      whereArgs: [clientShiftId, EventSyncStatus.pending],
      orderBy: 'createdAt ASC',
      limit: limit,
    );
    return rows.map(LocalFieldEvent.fromMap).toList();
  }

  /// Returns the most recent [limit] events for [clientShiftId] regardless of
  /// sync status. Used for diagnostics display.
  Future<List<LocalFieldEvent>> getRecentEvents(
    String clientShiftId, {
    int limit = 10,
  }) async {
    final rows = await _db.query(
      'local_field_events',
      where: 'clientShiftId = ?',
      whereArgs: [clientShiftId],
      orderBy: 'createdAt DESC',
      limit: limit,
    );
    return rows.map(LocalFieldEvent.fromMap).toList();
  }

  Future<void> markEventsInFlight(List<String> clientEventIds) async {
    if (clientEventIds.isEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final id in clientEventIds) {
      batch.rawUpdate(
        'UPDATE local_field_events '
        'SET syncStatus = ?, syncAttempts = syncAttempts + 1, updatedAt = ? '
        'WHERE clientEventId = ?',
        [EventSyncStatus.inFlight, now, id],
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> markEventsAcked(List<String> clientEventIds) async {
    if (clientEventIds.isEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final id in clientEventIds) {
      batch.update(
        'local_field_events',
        {'syncStatus': EventSyncStatus.acked, 'updatedAt': now},
        where: 'clientEventId = ?',
        whereArgs: [id],
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> markEventsRejected(List<Map<String, String>> rejections) async {
    if (rejections.isEmpty) return;
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final r in rejections) {
      batch.update(
        'local_field_events',
        {
          'syncStatus': EventSyncStatus.rejected,
          'lastErrorCode': r['reason'],
          'updatedAt': now,
        },
        where: 'clientEventId = ?',
        whereArgs: [r['clientEventId']],
      );
    }
    await batch.commit(noResult: true);
  }

  /// Resets all in-flight events for a shift back to pending.
  /// Call this on network / 5xx errors so events are retried.
  Future<void> resetInflightEvents(String clientShiftId) async {
    await _db.update(
      'local_field_events',
      {
        'syncStatus': EventSyncStatus.pending,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'clientShiftId = ? AND syncStatus = ?',
      whereArgs: [clientShiftId, EventSyncStatus.inFlight],
    );
  }

  // -------------------------------------------------------------------------
  // Health / diagnostics
  // -------------------------------------------------------------------------

  Future<Map<String, dynamic>> getQueueSummary(String clientShiftId) async {
    final result = await _db.rawQuery('''
      SELECT syncStatus, COUNT(*) as cnt
      FROM local_location_points
      WHERE clientShiftId = ?
      GROUP BY syncStatus
    ''', [clientShiftId]);

    final counts = <String, int>{};
    for (final row in result) {
      counts[row['syncStatus'] as String] = (row['cnt'] as int?) ?? 0;
    }

    final eventResult = await _db.rawQuery('''
      SELECT syncStatus, COUNT(*) as cnt
      FROM local_field_events
      WHERE clientShiftId = ?
      GROUP BY syncStatus
    ''', [clientShiftId]);

    final eventCounts = <String, int>{};
    for (final row in eventResult) {
      eventCounts[row['syncStatus'] as String] = (row['cnt'] as int?) ?? 0;
    }

    return {
      'clientShiftId': clientShiftId,
      'points': counts,
      'events': eventCounts,
      'pendingPoints': counts[PointSyncStatus.pending] ?? 0,
      'inFlightPoints': counts[PointSyncStatus.inFlight] ?? 0,
      'ackedPoints': counts[PointSyncStatus.acked] ?? 0,
      'duplicatePoints': counts[PointSyncStatus.duplicate] ?? 0,
      'rejectedPoints': counts[PointSyncStatus.rejected] ?? 0,
      'failedPoints': counts[PointSyncStatus.failed] ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  Future<void> _batchUpdatePointStatus(
    List<String> ids,
    String status, {
    bool incrementAttempts = false,
  }) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final batch = _db.batch();
    for (final id in ids) {
      if (incrementAttempts) {
        batch.rawUpdate(
          'UPDATE local_location_points '
          'SET syncStatus = ?, syncAttempts = syncAttempts + 1, updatedAt = ? '
          'WHERE clientPointId = ?',
          [status, now, id],
        );
      } else {
        batch.update(
          'local_location_points',
          {'syncStatus': status, 'updatedAt': now},
          where: 'clientPointId = ?',
          whereArgs: [id],
        );
      }
    }
    await batch.commit(noResult: true);
  }
}
