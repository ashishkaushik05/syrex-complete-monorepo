import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';

class PagedResult<T> {
  const PagedResult({required this.items, required this.nextCursor});

  final List<T> items;
  final String? nextCursor;
}

class SalesOutlet {
  const SalesOutlet({
    required this.id,
    required this.userId,
    required this.outletCode,
    required this.name,
    required this.ownerName,
    required this.outstandingBalance,
    required this.isActive,
  });

  final String id;
  final String userId;
  final String outletCode;
  final String name;
  final String ownerName;
  final String outstandingBalance;
  final bool isActive;

  factory SalesOutlet.fromJson(Map<String, dynamic> j) => SalesOutlet(
        id: j['id'] as String,
        userId: j['userId'] as String,
        outletCode: j['outletCode'] as String,
        name: j['name'] as String,
        ownerName: j['ownerName'] as String,
        outstandingBalance: j['outstandingBalance'] as String,
        isActive: j['isActive'] as bool,
      );
}

class SalesOrderLine {
  const SalesOrderLine({
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

  factory SalesOrderLine.fromJson(Map<String, dynamic> j) => SalesOrderLine(
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

class SalesOrder {
  const SalesOrder({
    required this.id,
    required this.orderNumber,
    required this.outletId,
    required this.createdById,
    required this.orderDate,
    required this.deliveryAddress,
    required this.status,
    required this.priority,
    required this.totalValue,
    required this.notes,
    required this.lines,
  });

  final String id;
  final String orderNumber;
  final String outletId;
  final String? createdById;
  final String orderDate;
  final String deliveryAddress;
  final String status;
  final String priority;
  final String totalValue;
  final String? notes;
  final List<SalesOrderLine> lines;

  factory SalesOrder.fromJson(Map<String, dynamic> j) => SalesOrder(
        id: j['id'] as String,
        orderNumber: j['orderNumber'] as String,
        outletId: j['outletId'] as String,
        createdById: j['createdById'] as String?,
        orderDate: j['orderDate'] as String,
        deliveryAddress: j['deliveryAddress'] as String,
        status: j['status'] as String,
        priority: j['priority'] as String,
        totalValue: j['totalValue'] as String,
        notes: j['notes'] as String?,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => SalesOrderLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SalesInvoice {
  const SalesInvoice({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    required this.outletId,
    required this.invoiceDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
  });

  final String id;
  final String invoiceNumber;
  final String orderId;
  final String outletId;
  final String invoiceDate;
  final String total;
  final String amountPaid;
  final String amountDue;

  factory SalesInvoice.fromJson(Map<String, dynamic> j) => SalesInvoice(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        orderId: j['orderId'] as String,
        outletId: j['outletId'] as String,
        invoiceDate: j['invoiceDate'] as String,
        total: j['total'] as String,
        amountPaid: j['amountPaid'] as String,
        amountDue: j['amountDue'] as String,
      );
}

class SalesInvoiceLine {
  const SalesInvoiceLine({
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

  factory SalesInvoiceLine.fromJson(Map<String, dynamic> j) => SalesInvoiceLine(
        id: j['id'] as String,
        sku: j['sku'] as String,
        qty: j['qty'] as int,
        unitPrice: j['unitPrice'] as String,
        lineTotal: j['lineTotal'] as String,
      );
}

class SalesInvoiceDetail {
  const SalesInvoiceDetail({
    required this.id,
    required this.invoiceNumber,
    required this.orderId,
    required this.outletId,
    required this.invoiceDate,
    required this.total,
    required this.amountPaid,
    required this.amountDue,
    required this.lines,
  });

  final String id;
  final String invoiceNumber;
  final String orderId;
  final String outletId;
  final String invoiceDate;
  final String total;
  final String amountPaid;
  final String amountDue;
  final List<SalesInvoiceLine> lines;

  factory SalesInvoiceDetail.fromJson(Map<String, dynamic> j) => SalesInvoiceDetail(
        id: j['id'] as String,
        invoiceNumber: j['invoiceNumber'] as String,
        orderId: j['orderId'] as String,
        outletId: j['outletId'] as String,
        invoiceDate: j['invoiceDate'] as String,
        total: j['total'] as String,
        amountPaid: j['amountPaid'] as String,
        amountDue: j['amountDue'] as String,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => SalesInvoiceLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SalesDispatchLine {
  const SalesDispatchLine({
    required this.id,
    required this.orderLineId,
    required this.orderId,
    required this.productId,
    required this.sku,
    required this.qtyDispatched,
    required this.serialNumbers,
  });

  final String id;
  final String orderLineId;
  final String orderId;
  final String productId;
  final String sku;
  final int qtyDispatched;
  final List<String> serialNumbers;

  factory SalesDispatchLine.fromJson(Map<String, dynamic> j) => SalesDispatchLine(
        id: j['id'] as String,
        orderLineId: j['orderLineId'] as String,
        orderId: j['orderId'] as String,
        productId: j['productId'] as String,
        sku: j['sku'] as String,
        qtyDispatched: j['qtyDispatched'] as int,
        serialNumbers: ((j['serialNumbers'] ?? const <dynamic>[]) as List<dynamic>)
            .map((e) => e.toString())
            .toList(),
      );
}

class SalesDispatchDetail {
  const SalesDispatchDetail({
    required this.id,
    required this.warehouseId,
    required this.transporterName,
    required this.vehicleNumber,
    required this.dispatchDate,
    required this.deliveryStatus,
    required this.lines,
    this.lrNumber,
    this.estimatedDelivery,
    this.deliveredAt,
  });

  final String id;
  final String warehouseId;
  final String transporterName;
  final String vehicleNumber;
  final String? lrNumber;
  final String dispatchDate;
  final String? estimatedDelivery;
  final String? deliveredAt;
  final String deliveryStatus;
  final List<SalesDispatchLine> lines;

  factory SalesDispatchDetail.fromJson(Map<String, dynamic> j) => SalesDispatchDetail(
        id: j['id'] as String,
        warehouseId: j['warehouseId'] as String,
        transporterName: j['transporterName'] as String,
        vehicleNumber: j['vehicleNumber'] as String,
        lrNumber: j['lrNumber'] as String?,
        dispatchDate: j['dispatchDate'] as String,
        estimatedDelivery: j['estimatedDelivery'] as String?,
        deliveredAt: j['deliveredAt'] as String?,
        deliveryStatus: j['deliveryStatus'] as String,
        lines: (j['lines'] as List<dynamic>)
            .map((e) => SalesDispatchLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

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

  Future<List<SalesOutlet>> outlets({String? q}) async {
    final res = await _dio.get(
      '/outlets.list',
      queryParameters: {
        'input': jsonEncode({
          'json': {
            'limit': 100,
            'isActive': true,
            if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          }
        })
      },
    );
    final data = _extract(res.data);
    return (data['items'] as List<dynamic>)
        .map((e) => SalesOutlet.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PagedResult<SalesOrder>> myOrders({String? status, String? q}) async {
    final res = await _dio.get(
      '/orders.list',
      queryParameters: {
        'input': jsonEncode({
          'json': {
            'limit': 50,
            'mineOnly': true,
            if (status != null) 'status': status,
            if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          }
        })
      },
    );
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => SalesOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<SalesOrder> getOrderById(String id) async {
    final res = await _dio.get(
      '/orders.getById',
      queryParameters: {
        'input': jsonEncode({
          'json': {'id': id}
        })
      },
    );
    return SalesOrder.fromJson(_extract(res.data));
  }

  Future<SalesOrder> createOrder({
    required String outletId,
    required String deliveryAddress,
    required List<OrderLineInput> lines,
    String priority = 'medium',
    String? notes,
  }) async {
    final payload = <String, dynamic>{
      'outletId': outletId,
      'deliveryAddress': deliveryAddress,
      'priority': priority,
      'lines': lines.map((line) => line.toJson()).toList(),
      if (notes != null) 'notes': notes,
    };

    final res = await _dio.post(
      '/orders.create',
      data: jsonEncode({'json': payload}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );

    return SalesOrder.fromJson(_extract(res.data));
  }

  Future<List<SalesInvoice>> invoices({String? outletId, String? q}) async {
    final res = await _dio.get(
      '/invoices.list',
      queryParameters: {
        'input': jsonEncode({
          'json': {
            'limit': 100,
            if (outletId != null && outletId.isNotEmpty) 'outletId': outletId,
            if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          }
        })
      },
    );
    final data = _extract(res.data);
    return (data['items'] as List<dynamic>)
        .map((e) => SalesInvoice.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<SalesInvoiceDetail> invoiceDetail(String id) async {
    final res = await _dio.get(
      '/invoices.getById',
      queryParameters: {
        'input': jsonEncode({
          'json': {'id': id}
        })
      },
    );
    return SalesInvoiceDetail.fromJson(_extract(res.data));
  }

  Future<SalesDispatchDetail> dispatchDetail(String id) async {
    final res = await _dio.get(
      '/dispatches.getById',
      queryParameters: {
        'input': jsonEncode({
          'json': {'id': id}
        })
      },
    );
    return SalesDispatchDetail.fromJson(_extract(res.data));
  }
}

final salesClientProvider = Provider<SalesClient>((ref) {
  return SalesClient(ref.watch(dioProvider));
});
