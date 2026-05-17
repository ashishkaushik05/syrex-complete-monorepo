class Shift {
  const Shift({
    required this.id,
    required this.agentId,
    required this.status,
    required this.startType,
    required this.startedAt,
    this.endType,
    this.endedAt,
    this.orgId,
  });

  final String id;
  final String agentId;
  final String status; // 'active' | 'completed'
  final String startType; // 'auto' | 'manual'
  final String? endType; // 'manual' | 'extended' | 'auto'
  final String startedAt;
  final String? endedAt;
  final String? orgId;

  bool get isActive => status == 'active';

  factory Shift.fromJson(Map<String, dynamic> j) => Shift(
        id: j['id'] as String,
        agentId: j['agentId'] as String,
        status: j['status'] as String,
        startType: j['startType'] as String,
        endType: j['endType'] as String?,
        startedAt: j['startedAt'] as String,
        endedAt: j['endedAt'] as String?,
        orgId: j['orgId'] as String?,
      );
}
