import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';

class PagedResult<T> {
  const PagedResult({required this.items, required this.nextCursor});

  final List<T> items;
  final String? nextCursor;
}

// ─── Outlets ───────────────────────────────────────────────────────────────────

class SalesOutlet {
  const SalesOutlet({
    required this.id,
    required this.userId,
    required this.outletCode,
    required this.name,
    required this.ownerName,
    required this.outstandingBalance,
    required this.isActive,
    this.creditLimit,
  });

  final String id;
  final String userId;
  final String outletCode;
  final String name;
  final String ownerName;
  final String outstandingBalance;
  final bool isActive;
  final String? creditLimit;

  double get outstandingBalanceNum => double.tryParse(outstandingBalance) ?? 0;
  double get creditLimitNum => double.tryParse(creditLimit ?? '0') ?? 0;

  factory SalesOutlet.fromJson(Map<String, dynamic> j) => SalesOutlet(
        id: j['id'] as String,
        userId: j['userId'] as String,
        outletCode: j['outletCode'] as String,
        name: j['name'] as String,
        ownerName: j['ownerName'] as String,
        outstandingBalance: j['outstandingBalance']?.toString() ?? '0',
        isActive: j['isActive'] as bool? ?? true,
        creditLimit: j['creditLimit']?.toString(),
      );
}

// ─── Orders ─────────────────────────────────────────────────────────────────────

class SalesOrderLine {
  const SalesOrderLine({
    required this.id,
    required this.productId,
    required this.sku,
    this.productName,
    required this.qtyOrdered,
    required this.qtyDispatched,
    required this.unitPrice,
    required this.lineTotal,
    required this.status,
  });

  final String id;
  final String productId;
  final String sku;
  final String? productName;
  final int qtyOrdered;
  final int qtyDispatched;
  final String unitPrice;
  final String lineTotal;
  final String status;

  double get unitPriceNum => double.tryParse(unitPrice) ?? 0;
  double get lineTotalNum => double.tryParse(lineTotal) ?? 0;

  factory SalesOrderLine.fromJson(Map<String, dynamic> j) => SalesOrderLine(
        id: j['id'] as String,
        productId: j['productId'] as String,
        sku: j['sku'] as String,
        productName: j['productName'] as String?,
        qtyOrdered: (j['qtyOrdered'] as num).toInt(),
        qtyDispatched: (j['qtyDispatched'] as num? ?? 0).toInt(),
        unitPrice: j['unitPrice']?.toString() ?? '0',
        lineTotal: j['lineTotal']?.toString() ?? '0',
        status: j['status'] as String? ?? 'pending',
      );
}

class TaxLine {
  const TaxLine({required this.k, required this.v});
  final String k;
  final double v;

  factory TaxLine.fromJson(Map<String, dynamic> j) => TaxLine(
        k: j['k'] as String? ?? j['type'] as String? ?? '',
        v: (j['v'] as num? ?? j['amount'] as num? ?? 0).toDouble(),
      );
}

class LinkedInvoice {
  const LinkedInvoice({required this.id, required this.code, required this.amount, required this.status});
  final String id;
  final String code;
  final double amount;
  final String status;

  factory LinkedInvoice.fromJson(Map<String, dynamic> j) => LinkedInvoice(
        id: j['id'] as String,
        code: j['invoiceNumber'] as String? ?? j['code'] as String? ?? '',
        amount: (j['total'] as num? ?? j['amount'] as num? ?? 0).toDouble(),
        status: j['status'] as String? ?? 'open',
      );
}

class LinkedDispatch {
  const LinkedDispatch({required this.id, required this.code, required this.date, required this.status, required this.items});
  final String id;
  final String code;
  final String date;
  final String status;
  final int items;

  factory LinkedDispatch.fromJson(Map<String, dynamic> j) => LinkedDispatch(
        id: j['id'] as String,
        code: j['dispatchCode'] as String? ?? j['code'] as String? ?? '',
        date: j['dispatchDate'] as String? ?? j['date'] as String? ?? '',
        status: j['deliveryStatus'] as String? ?? j['status'] as String? ?? '',
        items: (j['itemCount'] as num? ?? j['items'] as num? ?? 0).toInt(),
      );
}

class SalesOrder {
  const SalesOrder({
    required this.id,
    required this.orderNumber,
    required this.outletId,
    this.outletName,
    this.createdById,
    required this.orderDate,
    required this.deliveryAddress,
    required this.status,
    required this.priority,
    required this.totalValue,
    this.subtotal,
    this.discount,
    this.tax,
    this.notes,
    required this.lines,
    this.linkedInvoices = const [],
    this.linkedDispatches = const [],
    this.taxBreakdown = const [],
  });

  final String id;
  final String orderNumber;
  final String outletId;
  final String? outletName;
  final String? createdById;
  final String orderDate;
  final String deliveryAddress;
  final String status;
  final String priority;
  final String totalValue;
  final String? subtotal;
  final String? discount;
  final String? tax;
  final String? notes;
  final List<SalesOrderLine> lines;
  final List<LinkedInvoice> linkedInvoices;
  final List<LinkedDispatch> linkedDispatches;
  final List<TaxLine> taxBreakdown;

  int get lineCount => lines.length;
  double get totalValueNum => double.tryParse(totalValue) ?? 0;
  double get subtotalNum => double.tryParse(subtotal ?? '0') ?? 0;
  double get discountNum => double.tryParse(discount ?? '0') ?? 0;
  double get taxNum => double.tryParse(tax ?? '0') ?? 0;

  factory SalesOrder.fromJson(Map<String, dynamic> j) => SalesOrder(
        id: j['id'] as String,
        orderNumber: j['orderNumber'] as String,
        outletId: j['outletId'] as String,
        outletName: j['outletName'] as String? ?? (j['outlet'] as Map<String, dynamic>?)?['name'] as String?,
        createdById: j['createdById'] as String?,
        orderDate: j['orderDate'] as String,
        deliveryAddress: j['deliveryAddress'] as String? ?? '',
        status: j['status'] as String,
        priority: j['priority'] as String? ?? 'medium',
        totalValue: j['totalValue']?.toString() ?? '0',
        subtotal: j['subtotal']?.toString(),
        discount: j['discount']?.toString(),
        tax: j['tax']?.toString(),
        notes: j['notes'] as String?,
        lines: (j['lines'] as List<dynamic>? ?? [])
            .map((e) => SalesOrderLine.fromJson(e as Map<String, dynamic>))
            .toList(),
        linkedInvoices: (j['invoices'] as List<dynamic>? ?? j['linkedInvoices'] as List<dynamic>? ?? [])
            .map((e) => LinkedInvoice.fromJson(e as Map<String, dynamic>))
            .toList(),
        linkedDispatches: (j['dispatches'] as List<dynamic>? ?? j['linkedDispatches'] as List<dynamic>? ?? [])
            .map((e) => LinkedDispatch.fromJson(e as Map<String, dynamic>))
            .toList(),
        taxBreakdown: (j['taxBreakdown'] as List<dynamic>? ?? [])
            .map((e) => TaxLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ─── Invoices ──────────────────────────────────────────────────────────────────

class SalesInvoice {
  const SalesInvoice({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    this.orderCode,
    required this.outletId,
    required this.invoiceDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
    this.dueDate,
    this.status = 'open',
  });

  final String id;
  final String invoiceNumber;
  final String orderId;
  final String? orderCode;
  final String outletId;
  final String invoiceDate;
  final String total;
  final String amountPaid;
  final String amountDue;
  final String? dueDate;
  final String status;

  double get totalNum => double.tryParse(total) ?? 0;
  double get amountPaidNum => double.tryParse(amountPaid) ?? 0;
  double get amountDueNum => double.tryParse(amountDue) ?? 0;
  double get paidPct => totalNum > 0 ? (amountPaidNum / totalNum).clamp(0, 1) : 0;

  factory SalesInvoice.fromJson(Map<String, dynamic> j) => SalesInvoice(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        orderId: j['orderId'] as String,
        orderCode: j['orderCode'] as String? ?? (j['order'] as Map<String, dynamic>?)?['orderNumber'] as String?,
        outletId: j['outletId'] as String,
        invoiceDate: j['invoiceDate'] as String,
        total: j['total']?.toString() ?? '0',
        amountPaid: j['amountPaid']?.toString() ?? '0',
        amountDue: j['amountDue']?.toString() ?? '0',
        dueDate: j['dueDate'] as String?,
        status: j['status'] as String? ?? 'open',
      );
}

class InvoiceCharge {
  const InvoiceCharge({required this.k, required this.v});
  final String k;
  final double v;

  factory InvoiceCharge.fromJson(Map<String, dynamic> j) => InvoiceCharge(
        k: j['k'] as String? ?? j['type'] as String? ?? '',
        v: (j['v'] as num? ?? j['amount'] as num? ?? 0).toDouble(),
      );
}

class InvoicePayment {
  const InvoicePayment({required this.id, required this.date, required this.method, required this.amount});
  final String id;
  final String date;
  final String method;
  final double amount;

  factory InvoicePayment.fromJson(Map<String, dynamic> j) => InvoicePayment(
        id: j['id'] as String,
        date: j['paymentDate'] as String? ?? j['date'] as String? ?? '',
        method: j['method'] as String? ?? j['paymentMethod'] as String? ?? 'Payment',
        amount: (j['amount'] as num? ?? 0).toDouble(),
      );
}

class SalesInvoiceLine {
  const SalesInvoiceLine({
    required this.id,
    required this.sku,
    this.productName,
    required this.qty,
    required this.unitPrice,
    required this.lineTotal,
  });

  final String id;
  final String sku;
  final String? productName;
  final int qty;
  final String unitPrice;
  final String lineTotal;

  double get unitPriceNum => double.tryParse(unitPrice) ?? 0;
  double get lineTotalNum => double.tryParse(lineTotal) ?? 0;

  factory SalesInvoiceLine.fromJson(Map<String, dynamic> j) => SalesInvoiceLine(
        id: j['id'] as String,
        sku: j['sku'] as String? ?? '',
        productName: j['productName'] as String?,
        qty: (j['qty'] as num? ?? 1).toInt(),
        unitPrice: j['unitPrice']?.toString() ?? '0',
        lineTotal: j['lineTotal']?.toString() ?? '0',
      );
}

class SalesInvoiceDetail {
  const SalesInvoiceDetail({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    this.orderCode,
    required this.outletId,
    this.outletName,
    required this.invoiceDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
    this.dueDate,
    this.status = 'open',
    this.subtotal,
    this.discount,
    required this.lines,
    this.charges = const [],
    this.payments = const [],
  });

  final String id;
  final String invoiceNumber;
  final String orderId;
  final String? orderCode;
  final String outletId;
  final String? outletName;
  final String invoiceDate;
  final String total;
  final String amountPaid;
  final String amountDue;
  final String? dueDate;
  final String status;
  final String? subtotal;
  final String? discount;
  final List<SalesInvoiceLine> lines;
  final List<InvoiceCharge> charges;
  final List<InvoicePayment> payments;

  double get totalNum => double.tryParse(total) ?? 0;
  double get amountPaidNum => double.tryParse(amountPaid) ?? 0;
  double get amountDueNum => double.tryParse(amountDue) ?? 0;
  double get subtotalNum => double.tryParse(subtotal ?? '0') ?? 0;
  double get discountNum => double.tryParse(discount ?? '0') ?? 0;
  double get paidPct => totalNum > 0 ? (amountPaidNum / totalNum).clamp(0, 1) : 0;

  factory SalesInvoiceDetail.fromJson(Map<String, dynamic> j) => SalesInvoiceDetail(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        orderId: j['orderId'] as String,
        orderCode: j['orderCode'] as String? ?? (j['order'] as Map<String, dynamic>?)?['orderNumber'] as String?,
        outletId: j['outletId'] as String,
        outletName: j['outletName'] as String? ?? (j['outlet'] as Map<String, dynamic>?)?['name'] as String?,
        invoiceDate: j['invoiceDate'] as String,
        total: j['total']?.toString() ?? '0',
        amountPaid: j['amountPaid']?.toString() ?? '0',
        amountDue: j['amountDue']?.toString() ?? '0',
        dueDate: j['dueDate'] as String?,
        status: j['status'] as String? ?? 'open',
        subtotal: j['subtotal']?.toString(),
        discount: j['discount']?.toString(),
        lines: (j['lines'] as List<dynamic>? ?? [])
            .map((e) => SalesInvoiceLine.fromJson(e as Map<String, dynamic>))
            .toList(),
        charges: (j['charges'] as List<dynamic>? ?? j['taxLines'] as List<dynamic>? ?? [])
            .map((e) => InvoiceCharge.fromJson(e as Map<String, dynamic>))
            .toList(),
        payments: (j['payments'] as List<dynamic>? ?? [])
            .map((e) => InvoicePayment.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ─── Dispatches ────────────────────────────────────────────────────────────────

class SalesDispatchLine {
  const SalesDispatchLine({
    required this.id,
    required this.orderLineId,
    required this.orderId,
    required this.productId,
    required this.sku,
    this.productName,
    required this.qtyDispatched,
    required this.serialNumbers,
  });

  final String id;
  final String orderLineId;
  final String orderId;
  final String productId;
  final String sku;
  final String? productName;
  final int qtyDispatched;
  final List<String> serialNumbers;

  factory SalesDispatchLine.fromJson(Map<String, dynamic> j) => SalesDispatchLine(
        id: j['id'] as String,
        orderLineId: j['orderLineId'] as String? ?? '',
        orderId: j['orderId'] as String? ?? '',
        productId: j['productId'] as String? ?? '',
        sku: j['sku'] as String? ?? '',
        productName: j['productName'] as String?,
        qtyDispatched: (j['qtyDispatched'] as num? ?? 0).toInt(),
        serialNumbers: ((j['serialNumbers'] ?? const <dynamic>[]) as List<dynamic>)
            .map((e) => e.toString())
            .toList(),
      );
}

class DispatchTimelineStep {
  const DispatchTimelineStep({required this.time, required this.label, required this.done, this.current = false});
  final String time;
  final String label;
  final bool done;
  final bool current;

  factory DispatchTimelineStep.fromJson(Map<String, dynamic> j) => DispatchTimelineStep(
        time: j['time'] as String? ?? j['t'] as String? ?? '—',
        label: j['label'] as String? ?? j['event'] as String? ?? '',
        done: j['done'] as bool? ?? j['completed'] as bool? ?? false,
        current: j['current'] as bool? ?? false,
      );
}

class SalesDispatchDetail {
  const SalesDispatchDetail({
    required this.id,
    this.dispatchCode,
    this.orderCode,
    required this.warehouseId,
    required this.transporterName,
    required this.vehicleNumber,
    this.lrNumber,
    this.awb,
    this.driverPhone,
    required this.dispatchDate,
    this.estimatedDelivery,
    this.deliveredAt,
    required this.deliveryStatus,
    required this.lines,
    this.timeline = const [],
  });

  final String id;
  final String? dispatchCode;
  final String? orderCode;
  final String warehouseId;
  final String transporterName;
  final String vehicleNumber;
  final String? lrNumber;
  final String? awb;
  final String? driverPhone;
  final String dispatchDate;
  final String? estimatedDelivery;
  final String? deliveredAt;
  final String deliveryStatus;
  final List<SalesDispatchLine> lines;
  final List<DispatchTimelineStep> timeline;

  int get totalUnits => lines.fold(0, (s, l) => s + l.qtyDispatched);

  factory SalesDispatchDetail.fromJson(Map<String, dynamic> j) => SalesDispatchDetail(
        id: j['id'] as String,
        dispatchCode: j['dispatchCode'] as String?,
        orderCode: j['orderCode'] as String? ?? (j['order'] as Map<String, dynamic>?)?['orderNumber'] as String?,
        warehouseId: j['warehouseId'] as String? ?? '',
        transporterName: j['transporterName'] as String? ?? '—',
        vehicleNumber: j['vehicleNumber'] as String? ?? '—',
        lrNumber: j['lrNumber'] as String?,
        awb: j['awb'] as String? ?? j['lrNumber'] as String?,
        driverPhone: j['driverPhone'] as String?,
        dispatchDate: j['dispatchDate'] as String? ?? '',
        estimatedDelivery: j['estimatedDelivery'] as String?,
        deliveredAt: j['deliveredAt'] as String?,
        deliveryStatus: j['deliveryStatus'] as String? ?? 'pending',
        lines: (j['lines'] as List<dynamic>? ?? [])
            .map((e) => SalesDispatchLine.fromJson(e as Map<String, dynamic>))
            .toList(),
        timeline: (j['timeline'] as List<dynamic>? ?? [])
            .map((e) => DispatchTimelineStep.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ─── Order input ───────────────────────────────────────────────────────────────

class OrderLineInput {
  const OrderLineInput({
    required this.productId,
    required this.qtyOrdered,
    required this.unitPrice,
  });

  final String productId;
  final int qtyOrdered;
  final String unitPrice;

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'qtyOrdered': qtyOrdered,
        'unitPrice': unitPrice,
      };
}

// ─── SalesClient ───────────────────────────────────────────────────────────────

class SalesClient {
  SalesClient(this._dio);

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

  // ── Outlets ─────────────────────────────────────────────────────────────────

  Future<List<SalesOutlet>> outlets({String? q}) async {
    final outlets = <SalesOutlet>[];
    String? cursor;
    do {
      final res = await _dio.get('/outlets.list', queryParameters: {
        'input': jsonEncode({
          'json': {
            'limit': 100,
            'isActive': true,
            if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
            if (cursor != null) 'cursor': cursor,
          }
        })
      });
      final data = _extract(res.data);
      outlets.addAll((data['items'] as List<dynamic>? ?? [])
          .map((e) => SalesOutlet.fromJson(e as Map<String, dynamic>)));
      cursor = data['nextCursor'] as String?;
    } while (cursor != null);
    return outlets;
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  Future<PagedResult<SalesOrder>> myOrders({
    String? status,
    String? q,
    String? cursor,
    int limit = 25,
  }) async {
    final res = await _dio.get('/orders.list', queryParameters: {
      'input': jsonEncode({
        'json': {
          'limit': limit,
          'mineOnly': true,
          if (status != null) 'status': status,
          if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          if (cursor != null) 'cursor': cursor,
        }
      })
    });
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => SalesOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<SalesOrder> getOrderById(String id) async {
    final res = await _dio.get('/orders.getById', queryParameters: {
      'input': jsonEncode({'json': {'id': id}})
    });
    return SalesOrder.fromJson(_extract(res.data));
  }

  Future<SalesOrder> createOrder({
    required String outletId,
    required String deliveryAddress,
    required List<OrderLineInput> lines,
    String priority = 'medium',
    String? notes,
  }) async {
    final res = await _dio.post(
      '/orders.create',
      data: jsonEncode({
        'json': {
          'outletId': outletId,
          'deliveryAddress': deliveryAddress,
          'priority': priority,
          'lines': lines.map((l) => l.toJson()).toList(),
          if (notes != null) 'notes': notes,
        }
      }),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return SalesOrder.fromJson(_extract(res.data));
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────

  Future<PagedResult<SalesInvoice>> invoices({
    String? outletId,
    String? status,
    String? q,
    String? cursor,
    int limit = 25,
  }) async {
    final res = await _dio.get('/invoices.list', queryParameters: {
      'input': jsonEncode({
        'json': {
          'limit': limit,
          if (outletId != null && outletId.isNotEmpty) 'outletId': outletId,
          if (status != null) 'status': status,
          if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          if (cursor != null) 'cursor': cursor,
        }
      })
    });
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => SalesInvoice.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<SalesInvoiceDetail> invoiceDetail(String id) async {
    final res = await _dio.get('/invoices.getById', queryParameters: {
      'input': jsonEncode({'json': {'id': id}})
    });
    return SalesInvoiceDetail.fromJson(_extract(res.data));
  }

  // ── Dispatches ───────────────────────────────────────────────────────────────

  Future<SalesDispatchDetail> dispatchDetail(String id) async {
    final res = await _dio.get('/dispatches.getById', queryParameters: {
      'input': jsonEncode({'json': {'id': id}})
    });
    return SalesDispatchDetail.fromJson(_extract(res.data));
  }

  Future<List<SalesDispatchDetail>> dispatchesForOrder(String orderId) async {
    final res = await _dio.get('/dispatches.list', queryParameters: {
      'input': jsonEncode({'json': {'orderId': orderId, 'limit': 50}})
    });
    final data = _extract(res.data);
    return (data['items'] as List<dynamic>? ?? [])
        .map((e) => SalesDispatchDetail.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final salesClientProvider = Provider<SalesClient>((ref) {
  return SalesClient(ref.watch(dioProvider));
});
