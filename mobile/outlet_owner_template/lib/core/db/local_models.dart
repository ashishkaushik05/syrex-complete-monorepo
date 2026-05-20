// Local SQLite model classes for Field Sense offline queue.
// These mirror the remote Prisma models but are client-owned.

enum LocalShiftStatus {
  localActive,
  syncingStart,
  serverActive,
  endingPending,
  completed,
  conflict;

  String get value => switch (this) {
        LocalShiftStatus.localActive => 'local_active',
        LocalShiftStatus.syncingStart => 'syncing_start',
        LocalShiftStatus.serverActive => 'server_active',
        LocalShiftStatus.endingPending => 'ending_pending',
        LocalShiftStatus.completed => 'completed',
        LocalShiftStatus.conflict => 'conflict',
      };

  static LocalShiftStatus fromValue(String v) => switch (v) {
        'local_active' => LocalShiftStatus.localActive,
        'syncing_start' => LocalShiftStatus.syncingStart,
        'server_active' => LocalShiftStatus.serverActive,
        'ending_pending' => LocalShiftStatus.endingPending,
        'completed' => LocalShiftStatus.completed,
        _ => LocalShiftStatus.conflict,
      };
}

enum SyncStatus {
  pending,
  inFlight,
  acked,
  rejected;

  String get value => switch (this) {
        SyncStatus.pending => 'pending',
        SyncStatus.inFlight => 'in_flight',
        SyncStatus.acked => 'acked',
        SyncStatus.rejected => 'rejected',
      };

  static SyncStatus fromValue(String v) => switch (v) {
        'in_flight' => SyncStatus.inFlight,
        'acked' => SyncStatus.acked,
        'rejected' => SyncStatus.rejected,
        _ => SyncStatus.pending,
      };
}

class LocalShift {
  LocalShift({
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
  final LocalShiftStatus status;
  final String startedAt;
  final String? endedAt;
  final String? startSyncedAt;
  final String? endSyncedAt;
  final String? lastErrorCode;
  final String createdAt;
  final String updatedAt;

  bool get isSynced =>
      status == LocalShiftStatus.serverActive ||
      status == LocalShiftStatus.completed;

  Map<String, dynamic> toMap() => {
        'clientShiftId': clientShiftId,
        'serverShiftId': serverShiftId,
        'status': status.value,
        'startedAt': startedAt,
        'endedAt': endedAt,
        'startSyncedAt': startSyncedAt,
        'endSyncedAt': endSyncedAt,
        'lastErrorCode': lastErrorCode,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  factory LocalShift.fromMap(Map<String, dynamic> m) => LocalShift(
        clientShiftId: m['clientShiftId'] as String,
        serverShiftId: m['serverShiftId'] as String?,
        status: LocalShiftStatus.fromValue(m['status'] as String),
        startedAt: m['startedAt'] as String,
        endedAt: m['endedAt'] as String?,
        startSyncedAt: m['startSyncedAt'] as String?,
        endSyncedAt: m['endSyncedAt'] as String?,
        lastErrorCode: m['lastErrorCode'] as String?,
        createdAt: m['createdAt'] as String,
        updatedAt: m['updatedAt'] as String,
      );
}

class LocalLocationPoint {
  LocalLocationPoint({
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
    required this.syncAttempts,
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
  final bool? isMocked;
  final SyncStatus syncStatus;
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
        'isMocked': isMocked == null ? null : (isMocked! ? 1 : 0),
        'syncStatus': syncStatus.value,
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
        altitude: m['altitude'] == null ? null : (m['altitude'] as num).toDouble(),
        speed: m['speed'] == null ? null : (m['speed'] as num).toDouble(),
        heading: m['heading'] == null ? null : (m['heading'] as num).toDouble(),
        isMocked: m['isMocked'] == null ? null : (m['isMocked'] as int) == 1,
        syncStatus: SyncStatus.fromValue(m['syncStatus'] as String),
        syncAttempts: m['syncAttempts'] as int,
        lastErrorCode: m['lastErrorCode'] as String?,
        createdAt: m['createdAt'] as String,
        updatedAt: m['updatedAt'] as String,
      );

  Map<String, dynamic> toIngestJson() => {
        'clientPointId': clientPointId,
        'lat': lat,
        'lng': lng,
        'accuracy': accuracy,
        'recordedAt': recordedAt,
        'capturedAt': capturedAt,
        'source': source,
        if (altitude != null) 'altitude': altitude,
        if (speed != null) 'speed': speed,
        if (heading != null) 'heading': heading,
        if (isMocked != null) 'isMocked': isMocked,
        'platform': 'flutter',
      };
}

class LocalFieldEvent {
  LocalFieldEvent({
    required this.clientEventId,
    required this.clientShiftId,
    required this.eventType,
    required this.payloadJson,
    required this.syncStatus,
    required this.syncAttempts,
    this.lastErrorCode,
    required this.createdAt,
    required this.updatedAt,
  });

  final String clientEventId;
  final String clientShiftId;
  final String eventType; // 'visit' | 'stop_start' | 'stop_end'
  final String payloadJson;
  final SyncStatus syncStatus;
  final int syncAttempts;
  final String? lastErrorCode;
  final String createdAt;
  final String updatedAt;

  Map<String, dynamic> toMap() => {
        'clientEventId': clientEventId,
        'clientShiftId': clientShiftId,
        'eventType': eventType,
        'payloadJson': payloadJson,
        'syncStatus': syncStatus.value,
        'syncAttempts': syncAttempts,
        'lastErrorCode': lastErrorCode,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  factory LocalFieldEvent.fromMap(Map<String, dynamic> m) => LocalFieldEvent(
        clientEventId: m['clientEventId'] as String,
        clientShiftId: m['clientShiftId'] as String,
        eventType: m['eventType'] as String,
        payloadJson: m['payloadJson'] as String,
        syncStatus: SyncStatus.fromValue(m['syncStatus'] as String),
        syncAttempts: m['syncAttempts'] as int,
        lastErrorCode: m['lastErrorCode'] as String?,
        createdAt: m['createdAt'] as String,
        updatedAt: m['updatedAt'] as String,
      );
}
