import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import 'outlet_portal_client.dart' show PagedResult;

class PaymentAllocation {
  const PaymentAllocation({
    required this.id,
    required this.invoiceId,
    required this.amount,
    required this.allocatedAt,
  });

  final String id;
  final String invoiceId;
  final String amount;
  final String allocatedAt;

  factory PaymentAllocation.fromJson(Map<String, dynamic> j) =>
      PaymentAllocation(
        id: j['id'] as String,
        invoiceId: j['invoiceId'] as String,
        amount: j['amount'] as String,
        allocatedAt: j['allocatedAt'] as String,
      );
}

class PaymentItem {
  const PaymentItem({
    required this.id,
    required this.outletId,
    required this.amount,
    required this.paymentDate,
    this.reference,
    this.description,
    required this.createdAt,
    required this.allocations,
  });

  final String id;
  final String outletId;
  final String amount;
  final String paymentDate;
  final String? reference;
  final String? description;
  final String createdAt;
  final List<PaymentAllocation> allocations;

  factory PaymentItem.fromJson(Map<String, dynamic> j) => PaymentItem(
        id: j['id'] as String,
        outletId: j['outletId'] as String,
        amount: j['amount'] as String,
        paymentDate: j['paymentDate'] as String,
        reference: j['reference'] as String?,
        description: j['description'] as String?,
        createdAt: j['createdAt'] as String,
        allocations: (j['allocations'] as List<dynamic>)
            .map((e) => PaymentAllocation.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class PaymentsClient {
  PaymentsClient(this._dio);

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

  Future<PagedResult<PaymentItem>> list(
    String outletId, {
    String? cursor,
    int limit = 25,
    String? q,
  }) async {
    final params = <String, dynamic>{'outletId': outletId, 'limit': limit};
    if (cursor != null) params['cursor'] = cursor;
    if (q != null) params['q'] = q;

    final res = await _dio.get(
      '/payments.list',
      queryParameters: {'input': '{"json":${jsonEncode(params)}}'},
    );
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => PaymentItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }
}

final paymentsClientProvider = Provider<PaymentsClient>((ref) {
  return PaymentsClient(ref.watch(dioProvider));
});
