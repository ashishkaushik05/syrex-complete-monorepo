import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';

// ── DTOs ────────────────────────────────────────────────────────────────────

class OutletSummary {
  const OutletSummary({
    required this.outletId,
    required this.outstandingSnapshot,
    required this.outstandingLive,
    required this.openInvoicesCount,
    required this.ordersCount,
  });

  final String outletId;
  final String outstandingSnapshot;
  final String outstandingLive;
  final int openInvoicesCount;
  final int ordersCount;

  factory OutletSummary.fromJson(Map<String, dynamic> j) => OutletSummary(
        outletId: j['outletId'] as String,
        outstandingSnapshot: j['outstandingSnapshot'] as String,
        outstandingLive: j['outstandingLive'] as String,
        openInvoicesCount: j['openInvoicesCount'] as int,
        ordersCount: j['ordersCount'] as int,
      );
}

class OrderLine {
  const OrderLine({
    required this.id,
    required this.productId,
    required this.sku,
    required this.qtyOrdered,
    required this.qtyDispatched,
    required this.unitPrice,
    required this.lineTotal,
    required this.status,
  });

  final String id;
  final String productId;
  final String sku;
  final int qtyOrdered;
  final int qtyDispatched;
  final String unitPrice;
  final String lineTotal;
  final String status;

  factory OrderLine.fromJson(Map<String, dynamic> j) => OrderLine(
        id: j['id'] as String,
        productId: j['productId'] as String,
        sku: j['sku'] as String,
        qtyOrdered: j['qtyOrdered'] as int,
        qtyDispatched: j['qtyDispatched'] as int,
        unitPrice: j['unitPrice'] as String,
        lineTotal: j['lineTotal'] as String,
        status: j['status'] as String,
      );
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.outletId,
    required this.orderDate,
    required this.status,
    required this.priority,
    required this.totalValue,
    required this.createdAt,
    required this.lines,
  });

  final String id;
  final String orderNumber;
  final String outletId;
  final String orderDate;
  final String status;
  final String priority;
  final String totalValue;
  final String createdAt;
  final List<OrderLine> lines;

  factory OrderSummary.fromJson(Map<String, dynamic> j) => OrderSummary(
        id: j['id'] as String,
        orderNumber: j['orderNumber'] as String,
        outletId: j['outletId'] as String,
        orderDate: j['orderDate'] as String,
        status: j['status'] as String,
        priority: j['priority'] as String,
        totalValue: j['totalValue'] as String,
        createdAt: j['createdAt'] as String,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => OrderLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class LinkedDispatch {
  const LinkedDispatch({
    required this.id,
    required this.dispatchDate,
    required this.deliveryStatus,
    required this.transporterName,
    required this.vehicleNumber,
    this.lrNumber,
    this.estimatedDelivery,
    this.deliveredAt,
  });

  final String id;
  final String dispatchDate;
  final String deliveryStatus;
  final String transporterName;
  final String vehicleNumber;
  final String? lrNumber;
  final String? estimatedDelivery;
  final String? deliveredAt;

  factory LinkedDispatch.fromJson(Map<String, dynamic> j) => LinkedDispatch(
        id: j['id'] as String,
        dispatchDate: j['dispatchDate'] as String,
        deliveryStatus: j['deliveryStatus'] as String,
        transporterName: j['transporterName'] as String,
        vehicleNumber: j['vehicleNumber'] as String,
        lrNumber: j['lrNumber'] as String?,
        estimatedDelivery: j['estimatedDelivery'] as String?,
        deliveredAt: j['deliveredAt'] as String?,
      );
}

class LinkedInvoice {
  const LinkedInvoice({
    required this.id,
    required this.invoiceNumber,
    required this.invoiceDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
  });

  final String id;
  final String invoiceNumber;
  final String invoiceDate;
  final String total;
  final String amountPaid;
  final String amountDue;

  factory LinkedInvoice.fromJson(Map<String, dynamic> j) => LinkedInvoice(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        invoiceDate: j['invoiceDate'] as String,
        total: j['total'] as String,
        amountPaid: j['amountPaid'] as String,
        amountDue: j['amountDue'] as String,
      );
}

class OrderDetail extends OrderSummary {
  const OrderDetail({
    required super.id,
    required super.orderNumber,
    required super.outletId,
    required super.orderDate,
    required super.status,
    required super.priority,
    required super.totalValue,
    required super.createdAt,
    required super.lines,
    required this.deliveryAddress,
    this.notes,
    required this.linkedDispatches,
    required this.linkedInvoices,
  });

  final String deliveryAddress;
  final String? notes;
  final List<LinkedDispatch> linkedDispatches;
  final List<LinkedInvoice> linkedInvoices;

  factory OrderDetail.fromJson(Map<String, dynamic> j) => OrderDetail(
        id: j['id'] as String,
        orderNumber: j['orderNumber'] as String,
        outletId: j['outletId'] as String,
        orderDate: j['orderDate'] as String,
        status: j['status'] as String,
        priority: j['priority'] as String,
        totalValue: j['totalValue'] as String,
        createdAt: j['createdAt'] as String,
        deliveryAddress: j['deliveryAddress'] as String,
        notes: j['notes'] as String?,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => OrderLine.fromJson(e as Map<String, dynamic>))
            .toList(),
        linkedDispatches: (j['linkedDispatches'] as List<dynamic>)
            .map((e) => LinkedDispatch.fromJson(e as Map<String, dynamic>))
            .toList(),
        linkedInvoices: (j['linkedInvoices'] as List<dynamic>)
            .map((e) => LinkedInvoice.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class InvoiceListItem {
  const InvoiceListItem({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    required this.invoiceDate,
    this.dueDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
    required this.createdAt,
  });

  final String id;
  final String invoiceNumber;
  final String orderId;
  final String invoiceDate;
  final String? dueDate;
  final String total;
  final String amountPaid;
  final String amountDue;
  final String createdAt;

  factory InvoiceListItem.fromJson(Map<String, dynamic> j) => InvoiceListItem(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        orderId: j['orderId'] as String,
        invoiceDate: j['invoiceDate'] as String,
        dueDate: j['dueDate'] as String?,
        total: j['total'] as String,
        amountPaid: j['amountPaid'] as String,
        amountDue: j['amountDue'] as String,
        createdAt: j['createdAt'] as String,
      );
}

class InvoiceLineItem {
  const InvoiceLineItem({
    required this.id,
    required this.sku,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
  });

  final String id;
  final String sku;
  final int qty;
  final String unitPrice;
  final String lineTotal;

  factory InvoiceLineItem.fromJson(Map<String, dynamic> j) => InvoiceLineItem(
        id: j['id'] as String,
        sku: j['sku'] as String,
        qty: j['qty'] as int,
        unitPrice: j['unitPrice'] as String,
        lineTotal: j['lineTotal'] as String,
      );
}

class InvoiceCharge {
  const InvoiceCharge({
    required this.id,
    this.taxChargeId,
    required this.name,
    required this.type,
    required this.rate,
    required this.amount,
    required this.displayOrder,
  });

  final String id;
  final String? taxChargeId;
  final String name;
  final String type; // "percentage" | "fixed"
  final String rate;
  final String amount;
  final int displayOrder;

  factory InvoiceCharge.fromJson(Map<String, dynamic> j) => InvoiceCharge(
        id: j['id'] as String,
        taxChargeId: j['taxChargeId'] as String?,
        name: j['name'] as String,
        type: j['type'] as String,
        rate: j['rate'] as String,
        amount: j['amount'] as String,
        displayOrder: j['displayOrder'] as int,
      );
}

class InvoiceDetail {
  const InvoiceDetail({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    required this.orderNumber,
    required this.invoiceDate,
    this.dueDate,
    required this.subtotal,
    this.discountType,
    required this.discountRate,
    required this.discountAmount,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
    required this.createdAt,
    required this.lines,
    required this.charges,
  });

  final String id;
  final String invoiceNumber;
  final String orderId;
  final String orderNumber;
  final String invoiceDate;
  final String? dueDate;
  final String subtotal;
  final String? discountType;
  final String discountRate;
  final String discountAmount;
  final String total;
  final String amountPaid;
  final String amountDue;
  final String createdAt;
  final List<InvoiceLineItem> lines;
  final List<InvoiceCharge> charges;

  factory InvoiceDetail.fromJson(Map<String, dynamic> j) => InvoiceDetail(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        orderId: j['orderId'] as String,
        orderNumber: j['orderNumber'] as String,
        invoiceDate: j['invoiceDate'] as String,
        dueDate: j['dueDate'] as String?,
        subtotal: j['subtotal'] as String,
        discountType: j['discountType'] as String?,
        discountRate: j['discountRate'] as String,
        discountAmount: j['discountAmount'] as String,
        total: j['total'] as String,
        amountPaid: j['amountPaid'] as String,
        amountDue: j['amountDue'] as String,
        createdAt: j['createdAt'] as String,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => InvoiceLineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        charges: (j['charges'] as List<dynamic>)
            .map((e) => InvoiceCharge.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class DispatchLineItem {
  const DispatchLineItem({
    required this.id,
    required this.sku,
    required this.qtyOrdered,
    required this.qtyDispatched,
    required this.serialNumbers,
  });

  final String id;
  final String sku;
  final int qtyOrdered;
  final int qtyDispatched;
  final List<String> serialNumbers;

  factory DispatchLineItem.fromJson(Map<String, dynamic> j) => DispatchLineItem(
        id: j['id'] as String,
        sku: j['sku'] as String,
        qtyOrdered: j['qtyOrdered'] as int,
        qtyDispatched: j['qtyDispatched'] as int,
        serialNumbers: (j['serialNumbers'] as List<dynamic>)
            .map((e) => e as String)
            .toList(),
      );
}

class DispatchDetail {
  const DispatchDetail({
    required this.id,
    required this.dispatchDate,
    required this.deliveryStatus,
    required this.transporterName,
    required this.vehicleNumber,
    this.lrNumber,
    this.estimatedDelivery,
    this.deliveredAt,
    required this.lines,
  });

  final String id;
  final String dispatchDate;
  final String deliveryStatus;
  final String transporterName;
  final String vehicleNumber;
  final String? lrNumber;
  final String? estimatedDelivery;
  final String? deliveredAt;
  final List<DispatchLineItem> lines;

  factory DispatchDetail.fromJson(Map<String, dynamic> j) => DispatchDetail(
        id: j['id'] as String,
        dispatchDate: j['dispatchDate'] as String,
        deliveryStatus: j['deliveryStatus'] as String,
        transporterName: j['transporterName'] as String,
        vehicleNumber: j['vehicleNumber'] as String,
        lrNumber: j['lrNumber'] as String?,
        estimatedDelivery: j['estimatedDelivery'] as String?,
        deliveredAt: j['deliveredAt'] as String?,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => DispatchLineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class ArAgingRow {
  const ArAgingRow({
    required this.id,
    required this.invoiceNumber,
    required this.outletId,
    required this.invoiceDate,
    this.dueDate,
    required this.amountDue,
    required this.daysPastDue,
    required this.agingBucket,
  });

  final String id;
  final String invoiceNumber;
  final String outletId;
  final String invoiceDate;
  final String? dueDate;
  final String amountDue;
  final int daysPastDue;
  final String agingBucket;

  factory ArAgingRow.fromJson(Map<String, dynamic> j) => ArAgingRow(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        outletId: j['outletId'] as String,
        invoiceDate: j['invoiceDate'] as String,
        dueDate: j['dueDate'] as String?,
        amountDue: j['amountDue'] as String,
        daysPastDue: j['daysPastDue'] as int,
        agingBucket: j['agingBucket'] as String,
      );
}

class ArAgingSummary {
  const ArAgingSummary({
    required this.current,
    required this.bucket1_30,
    required this.bucket31_60,
    required this.bucket61_90,
    required this.bucket90Plus,
    required this.totalOutstanding,
  });

  final String current;
  final String bucket1_30;
  final String bucket31_60;
  final String bucket61_90;
  final String bucket90Plus;
  final String totalOutstanding;

  factory ArAgingSummary.fromJson(Map<String, dynamic> j) => ArAgingSummary(
        current: j['current'] as String,
        bucket1_30: j['bucket1_30'] as String,
        bucket31_60: j['bucket31_60'] as String,
        bucket61_90: j['bucket61_90'] as String,
        bucket90Plus: j['bucket90Plus'] as String,
        totalOutstanding: j['totalOutstanding'] as String,
      );
}

class ArAgingResult {
  const ArAgingResult({
    required this.items,
    required this.nextCursor,
    required this.summary,
  });

  final List<ArAgingRow> items;
  final String? nextCursor;
  final ArAgingSummary summary;
}

class PagedResult<T> {
  const PagedResult({required this.items, required this.nextCursor});

  final List<T> items;
  final String? nextCursor;
}

// ── Client ───────────────────────────────────────────────────────────────────

class OutletPortalClient {
  OutletPortalClient(this._dio);

  final Dio _dio;

  Map<String, dynamic> _extract(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) {
        return (first['result']?['data']?['json'] ?? <String, dynamic>{})
            as Map<String, dynamic>;
      }
    }
    if (raw is Map<String, dynamic>) {
      return (raw['result']?['data']?['json'] ?? <String, dynamic>{})
          as Map<String, dynamic>;
    }
    return <String, dynamic>{};
  }

  Future<OutletSummary> summary(String outletId) async {
    final res = await _dio.get(
      '/outletPortal.summary',
      queryParameters: {'input': '{"json":{"outletId":"$outletId"}}'},
    );
    return OutletSummary.fromJson(_extract(res.data));
  }

  Future<PagedResult<OrderSummary>> orderHistory(
    String outletId, {
    String? cursor,
    int limit = 25,
    String? status,
    String? q,
  }) async {
    final params = <String, dynamic>{'outletId': outletId, 'limit': limit};
    if (cursor != null) params['cursor'] = cursor;
    if (status != null) params['status'] = status;
    if (q != null) params['q'] = q;

    final res = await _dio.get(
      '/outletPortal.orderHistory',
      queryParameters: {'input': '{"json":${jsonEncode(params)}}'},
    );
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => OrderSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<OrderDetail> orderDetail(String outletId, String orderId) async {
    final res = await _dio.get(
      '/outletPortal.orderDetail',
      queryParameters: {
        'input': '{"json":${jsonEncode({
              'outletId': outletId,
              'orderId': orderId
            })}}',
      },
    );
    return OrderDetail.fromJson(_extract(res.data));
  }

  Future<PagedResult<LinkedDispatch>> dispatchHistory(
    String outletId, {
    String? cursor,
    int limit = 25,
  }) async {
    final params = <String, dynamic>{'outletId': outletId, 'limit': limit};
    if (cursor != null) params['cursor'] = cursor;
    final res = await _dio.get(
      '/outletPortal.dispatchHistory',
      queryParameters: {'input': '{"json":${jsonEncode(params)}}'},
    );
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => LinkedDispatch.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<DispatchDetail> dispatchDetail(
      String outletId, String dispatchId) async {
    final res = await _dio.get(
      '/outletPortal.dispatchDetail',
      queryParameters: {
        'input': '{"json":${jsonEncode({
              'outletId': outletId,
              'dispatchId': dispatchId
            })}}',
      },
    );
    return DispatchDetail.fromJson(_extract(res.data));
  }

  Future<PagedResult<InvoiceListItem>> invoiceHistory(
    String outletId, {
    String? cursor,
    int limit = 25,
    String? q,
  }) async {
    final params = <String, dynamic>{'outletId': outletId, 'limit': limit};
    if (cursor != null) params['cursor'] = cursor;
    if (q != null) params['q'] = q;

    final res = await _dio.get(
      '/outletPortal.invoiceHistory',
      queryParameters: {'input': '{"json":${jsonEncode(params)}}'},
    );
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => InvoiceListItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<InvoiceDetail> invoiceDetail(String outletId, String invoiceId) async {
    final res = await _dio.get(
      '/outletPortal.invoiceDetail',
      queryParameters: {
        'input': '{"json":${jsonEncode({
              'outletId': outletId,
              'invoiceId': invoiceId
            })}}',
      },
    );
    return InvoiceDetail.fromJson(_extract(res.data));
  }

  Future<void> markDispatchDelivered(
    String dispatchId, {
    String? note,
    DateTime? deliveredAt,
  }) async {
    final payload = <String, dynamic>{
      'id': dispatchId,
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      if (deliveredAt != null)
        'deliveredAt': deliveredAt.toUtc().toIso8601String(),
    };

    await _dio.post(
      '/dispatches.markDelivered',
      data: jsonEncode({'json': payload}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
  }

  Future<ArAgingResult> arAging(
    String outletId, {
    String? cursor,
    int limit = 100,
  }) async {
    final params = <String, dynamic>{
      'outletId': outletId,
      'limit': limit,
    };
    if (cursor != null) params['cursor'] = cursor;

    final res = await _dio.get(
      '/invoices.arAging',
      queryParameters: {'input': '{"json":${jsonEncode(params)}}'},
    );
    final data = _extract(res.data);
    return ArAgingResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => ArAgingRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
      summary: ArAgingSummary.fromJson(data['summary'] as Map<String, dynamic>),
    );
  }
}

final outletPortalClientProvider = Provider<OutletPortalClient>((ref) {
  return OutletPortalClient(ref.watch(dioProvider));
});
