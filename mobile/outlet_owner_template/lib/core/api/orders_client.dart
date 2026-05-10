import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import 'outlet_portal_client.dart' show OrderSummary;

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

class OrdersClient {
  OrdersClient(this._dio);

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

  Future<OrderSummary> createOrder({
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
      'lines': lines.map((l) => l.toJson()).toList(),
      if (notes != null) 'notes': notes,
    };

    final res = await _dio.post(
      '/orders.create',
      data: jsonEncode({'json': payload}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
    return OrderSummary.fromJson(_extract(res.data));
  }
}

final ordersClientProvider = Provider<OrdersClient>((ref) {
  return OrdersClient(ref.watch(dioProvider));
});
