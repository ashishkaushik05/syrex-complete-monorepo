class DispatchDto {
  final String id;
  final String? dispatchDate;
  final String deliveryStatus;
  final String transporterName;
  final String vehicleNumber;
  final String? lrNumber;
  final String? estimatedDelivery;
  final String? deliveredAt;

  const DispatchDto({
    required this.id,
    this.dispatchDate,
    required this.deliveryStatus,
    required this.transporterName,
    required this.vehicleNumber,
    this.lrNumber,
    this.estimatedDelivery,
    this.deliveredAt,
  });

  factory DispatchDto.fromJson(Map<String, dynamic> j) => DispatchDto(
    id: j['id'] as String,
    dispatchDate: j['dispatchDate'] as String?,
    deliveryStatus: j['deliveryStatus'] as String,
    transporterName: j['transporterName'] as String,
    vehicleNumber: j['vehicleNumber'] as String,
    lrNumber: j['lrNumber'] as String?,
    estimatedDelivery: j['estimatedDelivery'] as String?,
    deliveredAt: j['deliveredAt'] as String?,
  );
}

class DispatchLineDto {
  final String id;
  final String sku;
  final int qtyOrdered;
  final int qtyDispatched;
  final List<String> serialNumbers;

  const DispatchLineDto({
    required this.id,
    required this.sku,
    required this.qtyOrdered,
    required this.qtyDispatched,
    required this.serialNumbers,
  });

  factory DispatchLineDto.fromJson(Map<String, dynamic> j) => DispatchLineDto(
    id: j['id'] as String,
    sku: j['sku'] as String,
    qtyOrdered: (j['qtyOrdered'] as num).toInt(),
    qtyDispatched: (j['qtyDispatched'] as num).toInt(),
    serialNumbers: (j['serialNumbers'] as List<dynamic>? ?? []).cast<String>(),
  );
}

class DispatchDetailDto extends DispatchDto {
  final List<DispatchLineDto> lines;

  const DispatchDetailDto({
    required super.id,
    super.dispatchDate,
    required super.deliveryStatus,
    required super.transporterName,
    required super.vehicleNumber,
    super.lrNumber,
    super.estimatedDelivery,
    super.deliveredAt,
    required this.lines,
  });

  factory DispatchDetailDto.fromJson(Map<String, dynamic> j) => DispatchDetailDto(
    id: j['id'] as String,
    dispatchDate: j['dispatchDate'] as String?,
    deliveryStatus: j['deliveryStatus'] as String,
    transporterName: j['transporterName'] as String,
    vehicleNumber: j['vehicleNumber'] as String,
    lrNumber: j['lrNumber'] as String?,
    estimatedDelivery: j['estimatedDelivery'] as String?,
    deliveredAt: j['deliveredAt'] as String?,
    lines: (j['lines'] as List<dynamic>? ?? [])
        .map((e) => DispatchLineDto.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class PagedDispatches {
  final List<DispatchDto> items;
  final String? nextCursor;

  const PagedDispatches({required this.items, this.nextCursor});

  factory PagedDispatches.fromJson(Map<String, dynamic> j) => PagedDispatches(
    items: (j['items'] as List<dynamic>).map((e) => DispatchDto.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: j['nextCursor'] as String?,
  );
}
