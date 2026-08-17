class InvoiceDto {
  final String id;
  final String invoiceNumber;
  final String orderId;
  final String outletId;
  final String? invoiceDate;
  final String? dueDate;
  final String total;
  final String amountPaid;
  final String amountDue;
  final String? createdAt;

  const InvoiceDto({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    required this.outletId,
    this.invoiceDate,
    this.dueDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
    this.createdAt,
  });

  factory InvoiceDto.fromJson(Map<String, dynamic> j) => InvoiceDto(
    id: j['id'] as String,
    invoiceNumber: j['invoiceNumber'] as String,
    orderId: j['orderId'] as String,
    outletId: j['outletId'] as String? ?? '',
    invoiceDate: j['invoiceDate'] as String?,
    dueDate: j['dueDate'] as String?,
    total: j['total'].toString(),
    amountPaid: j['amountPaid'].toString(),
    amountDue: j['amountDue'].toString(),
    createdAt: j['createdAt'] as String?,
  );
}

class InvoiceCharge {
  final String id;
  final String name;
  final String type;
  final String rate;
  final String amount;
  final int displayOrder;

  const InvoiceCharge({
    required this.id,
    required this.name,
    required this.type,
    required this.rate,
    required this.amount,
    required this.displayOrder,
  });

  factory InvoiceCharge.fromJson(Map<String, dynamic> j) => InvoiceCharge(
    id: j['id'] as String,
    name: j['name'] as String,
    type: j['type'] as String,
    rate: j['rate'].toString(),
    amount: j['amount'].toString(),
    displayOrder: (j['displayOrder'] as num? ?? 0).toInt(),
  );
}

class InvoiceLine {
  final String id;
  final String sku;
  final int qty;
  final String unitPrice;
  final String lineTotal;

  const InvoiceLine({
    required this.id,
    required this.sku,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
  });

  factory InvoiceLine.fromJson(Map<String, dynamic> j) => InvoiceLine(
    id: j['id'] as String,
    sku: j['sku'] as String,
    qty: (j['qty'] as num).toInt(),
    unitPrice: j['unitPrice'].toString(),
    lineTotal: j['lineTotal'].toString(),
  );
}

class InvoiceDetailDto extends InvoiceDto {
  final String orderNumber;
  final String? subtotal;
  final String? discountAmount;
  final List<InvoiceCharge> charges;
  final List<InvoiceLine> lines;

  const InvoiceDetailDto({
    required super.id,
    required super.invoiceNumber,
    required super.orderId,
    required super.outletId,
    super.invoiceDate,
    super.dueDate,
    required super.total,
    required super.amountPaid,
    required super.amountDue,
    super.createdAt,
    required this.orderNumber,
    this.subtotal,
    this.discountAmount,
    required this.charges,
    required this.lines,
  });

  factory InvoiceDetailDto.fromJson(Map<String, dynamic> j) => InvoiceDetailDto(
    id: j['id'] as String,
    invoiceNumber: j['invoiceNumber'] as String,
    orderId: j['orderId'] as String,
    outletId: j['outletId'] as String? ?? '',
    invoiceDate: j['invoiceDate'] as String?,
    dueDate: j['dueDate'] as String?,
    total: j['total'].toString(),
    amountPaid: j['amountPaid'].toString(),
    amountDue: j['amountDue'].toString(),
    createdAt: j['createdAt'] as String?,
    orderNumber: j['orderNumber'] as String? ?? '',
    subtotal: j['subtotal']?.toString(),
    discountAmount: j['discountAmount']?.toString(),
    charges: (j['charges'] as List<dynamic>? ?? [])
        .map((e) => InvoiceCharge.fromJson(e as Map<String, dynamic>))
        .toList(),
    lines: (j['lines'] as List<dynamic>? ?? [])
        .map((e) => InvoiceLine.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class PagedInvoices {
  final List<InvoiceDto> items;
  final String? nextCursor;

  const PagedInvoices({required this.items, this.nextCursor});

  factory PagedInvoices.fromJson(Map<String, dynamic> j) => PagedInvoices(
    items: (j['items'] as List<dynamic>).map((e) => InvoiceDto.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: j['nextCursor'] as String?,
  );
}
