class OutletSummaryDto {
  final String outletId;
  final String outstandingLive;
  final String outstandingSnapshot;
  final int openInvoicesCount;
  final int ordersCount;

  const OutletSummaryDto({
    required this.outletId,
    required this.outstandingLive,
    required this.outstandingSnapshot,
    required this.openInvoicesCount,
    required this.ordersCount,
  });

  factory OutletSummaryDto.fromJson(Map<String, dynamic> j) => OutletSummaryDto(
    outletId: j['outletId'] as String,
    outstandingLive: j['outstandingLive'].toString(),
    outstandingSnapshot: j['outstandingSnapshot'].toString(),
    openInvoicesCount: (j['openInvoicesCount'] as num).toInt(),
    ordersCount: (j['ordersCount'] as num).toInt(),
  );
}

class OutletProfileDto {
  final String id;
  final String outletCode;
  final String name;
  final String ownerName;
  final String phone;
  final String address;
  final String creditLimit;
  final String outstandingBalance;
  final bool isActive;
  final String? legalName;
  final String? gstin;
  final String? billingAddress1;
  final String? billingAddress2;
  final String? billingCity;
  final String? billingState;
  final String? billingPincode;
  final String? warehouseId;

  const OutletProfileDto({
    required this.id,
    required this.outletCode,
    required this.name,
    required this.ownerName,
    required this.phone,
    required this.address,
    required this.creditLimit,
    required this.outstandingBalance,
    required this.isActive,
    this.legalName,
    this.gstin,
    this.billingAddress1,
    this.billingAddress2,
    this.billingCity,
    this.billingState,
    this.billingPincode,
    this.warehouseId,
  });

  factory OutletProfileDto.fromJson(Map<String, dynamic> j) => OutletProfileDto(
    id: j['id'] as String,
    outletCode: j['outletCode'] as String,
    name: j['name'] as String,
    ownerName: j['ownerName'] as String,
    phone: j['phone'] as String,
    address: j['address'] as String,
    creditLimit: j['creditLimit'].toString(),
    outstandingBalance: j['outstandingBalance'].toString(),
    isActive: j['isActive'] as bool? ?? true,
    legalName: j['legalName'] as String?,
    gstin: j['gstin'] as String?,
    billingAddress1: j['billingAddress1'] as String?,
    billingAddress2: j['billingAddress2'] as String?,
    billingCity: j['billingCity'] as String?,
    billingState: j['billingState'] as String?,
    billingPincode: j['billingPincode'] as String?,
    warehouseId: j['warehouseId'] as String?,
  );

  String get initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.substring(0, name.length.clamp(0, 2)).toUpperCase();
  }
}
