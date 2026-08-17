class OrderLineDto {
  final String id;
  final String productId;
  final String sku;
  final int qtyOrdered;
  final int qtyDispatched;
  final String unitPrice;
  final String lineTotal;
  final String status;

  const OrderLineDto({
    required this.id,
    required this.productId,
    required this.sku,
    required this.qtyOrdered,
    required this.qtyDispatched,
    required this.unitPrice,
    required this.lineTotal,
    required this.status,
  });

  factory OrderLineDto.fromJson(Map<String, dynamic> j) => OrderLineDto(
    id: j['id'] as String,
    productId: j['productId'] as String,
    sku: j['sku'] as String,
    qtyOrdered: (j['qtyOrdered'] as num).toInt(),
    qtyDispatched: (j['qtyDispatched'] as num? ?? 0).toInt(),
    unitPrice: j['unitPrice'].toString(),
    lineTotal: j['lineTotal'].toString(),
    status: j['status'] as String? ?? 'pending',
  );
}

class OrderDto {
  final String id;
  final String orderNumber;
  final String outletId;
  final String status;
  final String priority;
  final String? orderDate;
  final String deliveryAddress;
  final String totalValue;
  final String subtotalValue;
  final String taxTotal;
  final String? notes;
  final String? approvedAt;
  final String? rejectionReason;
  final List<OrderLineDto> lines;

  const OrderDto({
    required this.id,
    required this.orderNumber,
    required this.outletId,
    required this.status,
    required this.priority,
    this.orderDate,
    required this.deliveryAddress,
    required this.totalValue,
    required this.subtotalValue,
    required this.taxTotal,
    this.notes,
    this.approvedAt,
    this.rejectionReason,
    required this.lines,
  });

  factory OrderDto.fromJson(Map<String, dynamic> j) => OrderDto(
    id: j['id'] as String,
    orderNumber: j['orderNumber'] as String,
    outletId: j['outletId'] as String,
    status: j['status'] as String,
    priority: j['priority'] as String? ?? 'medium',
    orderDate: j['orderDate'] as String?,
    deliveryAddress: j['deliveryAddress'] as String? ?? '',
    totalValue: j['totalValue'].toString(),
    subtotalValue: j['subtotalValue'].toString(),
    taxTotal: j['taxTotal'].toString(),
    notes: j['notes'] as String?,
    approvedAt: j['approvedAt'] as String?,
    rejectionReason: j['rejectionReason'] as String?,
    lines: (j['lines'] as List<dynamic>? ?? [])
        .map((e) => OrderLineDto.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  String get displayStatus {
    if (status == 'pending_approval') return 'pending';
    if (status == 'fully_dispatched' || status == 'partially_dispatched') return 'dispatched';
    return status;
  }
}

class PagedOrders {
  final List<OrderDto> items;
  final String? nextCursor;

  const PagedOrders({required this.items, this.nextCursor});

  factory PagedOrders.fromJson(Map<String, dynamic> j) => PagedOrders(
    items: (j['items'] as List<dynamic>).map((e) => OrderDto.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: j['nextCursor'] as String?,
  );
}

class CreateOrderLineInput {
  final String productId;
  final int qtyOrdered;
  final String unitPrice;

  const CreateOrderLineInput({
    required this.productId,
    required this.qtyOrdered,
    required this.unitPrice,
  });

  Map<String, dynamic> toJson() => {
    'productId': productId,
    'qtyOrdered': qtyOrdered,
    'unitPrice': unitPrice,
  };
}

class CreateOrderInput {
  final String outletId;
  final String deliveryAddress;
  final String priority;
  final List<CreateOrderLineInput> lines;
  final String? notes;

  const CreateOrderInput({
    required this.outletId,
    required this.deliveryAddress,
    required this.priority,
    required this.lines,
    this.notes,
  });

  Map<String, dynamic> toJson() => {
    'outletId': outletId,
    'deliveryAddress': deliveryAddress,
    'priority': priority,
    'lines': lines.map((l) => l.toJson()).toList(),
    if (notes != null) 'notes': notes,
  };
}
