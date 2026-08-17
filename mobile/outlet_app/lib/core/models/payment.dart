class PaymentDto {
  final String id;
  final String outletId;
  final String amount;
  final String paymentDate;
  final String? reference;
  final String? description;
  final bool voided;
  final String? voidReason;
  final String? createdAt;

  const PaymentDto({
    required this.id,
    required this.outletId,
    required this.amount,
    required this.paymentDate,
    this.reference,
    this.description,
    required this.voided,
    this.voidReason,
    this.createdAt,
  });

  factory PaymentDto.fromJson(Map<String, dynamic> j) => PaymentDto(
    id: j['id'] as String,
    outletId: j['outletId'] as String? ?? '',
    amount: j['amount'].toString(),
    paymentDate: j['paymentDate'] as String,
    reference: j['reference'] as String?,
    description: j['description'] as String?,
    voided: j['voidedAt'] != null,
    voidReason: j['voidReason'] as String?,
    createdAt: j['createdAt'] as String?,
  );
}

class PaymentAllocation {
  final String invoiceId;
  final String invoiceNumber;
  final String amount;

  const PaymentAllocation({
    required this.invoiceId,
    required this.invoiceNumber,
    required this.amount,
  });

  factory PaymentAllocation.fromJson(Map<String, dynamic> j) => PaymentAllocation(
    invoiceId: j['invoiceId'] as String,
    invoiceNumber: j['invoiceNumber'] as String? ?? j['invoiceId'] as String,
    amount: j['amount'].toString(),
  );
}

class PaymentDetailDto extends PaymentDto {
  final List<PaymentAllocation> allocations;

  const PaymentDetailDto({
    required super.id,
    required super.outletId,
    required super.amount,
    required super.paymentDate,
    super.reference,
    super.description,
    required super.voided,
    super.voidReason,
    super.createdAt,
    required this.allocations,
  });

  factory PaymentDetailDto.fromJson(Map<String, dynamic> j) => PaymentDetailDto(
    id: j['id'] as String,
    outletId: j['outletId'] as String? ?? '',
    amount: j['amount'].toString(),
    paymentDate: j['paymentDate'] as String,
    reference: j['reference'] as String?,
    description: j['description'] as String?,
    voided: j['voidedAt'] != null,
    voidReason: j['voidReason'] as String?,
    createdAt: j['createdAt'] as String?,
    allocations: (j['allocations'] as List<dynamic>? ?? [])
        .map((e) => PaymentAllocation.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class PagedPayments {
  final List<PaymentDto> items;
  final String? nextCursor;

  const PagedPayments({required this.items, this.nextCursor});

  factory PagedPayments.fromJson(Map<String, dynamic> j) => PagedPayments(
    items: (j['items'] as List<dynamic>).map((e) => PaymentDto.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: j['nextCursor'] as String?,
  );
}
