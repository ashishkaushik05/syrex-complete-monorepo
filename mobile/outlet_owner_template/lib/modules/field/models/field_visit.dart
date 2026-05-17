class FieldVisit {
  const FieldVisit({
    required this.id,
    required this.agentId,
    required this.shiftId,
    required this.lat,
    required this.lng,
    required this.recordedAt,
    this.description,
    this.audioUrl,
    this.orgId,
  });

  final String id;
  final String agentId;
  final String shiftId;
  final double lat;
  final double lng;
  final String recordedAt;
  final String? description;
  final String? audioUrl;
  final String? orgId;

  factory FieldVisit.fromJson(Map<String, dynamic> j) => FieldVisit(
        id: j['id'] as String,
        agentId: j['agentId'] as String,
        shiftId: j['shiftId'] as String,
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        recordedAt: j['recordedAt'] as String,
        description: j['description'] as String?,
        audioUrl: j['audioUrl'] as String?,
        orgId: j['orgId'] as String?,
      );
}
