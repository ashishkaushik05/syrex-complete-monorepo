import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';

class ComplaintListItem {
  const ComplaintListItem({
    required this.id,
    required this.status,
    this.outletId,
    this.outletName,
    required this.raisedById,
    required this.createdAt,
  });

  final String id;
  final String status;
  final String? outletId;
  final String? outletName;
  final String raisedById;
  final String createdAt;

  factory ComplaintListItem.fromJson(Map<String, dynamic> j) =>
      ComplaintListItem(
        id: j['id'] as String,
        status: j['status'] as String,
        outletId: j['outletId'] as String?,
        outletName: j['outletName'] as String?,
        raisedById: j['raisedById'] as String,
        createdAt: j['createdAt'] as String,
      );
}

class ComplaintLineInput {
  const ComplaintLineInput({
    this.productId,
    this.sku,
    required this.description,
    this.serialNumber,
    this.qty = 1,
  });

  final String? productId;
  final String? sku;
  final String description;
  final String? serialNumber;
  final int qty;

  Map<String, dynamic> toJson() => {
        if (productId != null) 'productId': productId,
        if (sku != null) 'sku': sku,
        'description': description,
        if (serialNumber != null) 'serial': serialNumber,
        'qty': qty,
      };
}

class ServiceComplaintsClient {
  ServiceComplaintsClient(this._dio);

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

  Future<List<ComplaintListItem>> list(String outletId) async {
    final res = await _dio.get(
      '/serviceComplaints.list',
      queryParameters: {
        'input': '{"json":${jsonEncode({'outletId': outletId, 'limit': 50})}}',
      },
    );
    final data = _extract(res.data);
    final items = data['items'] as List<dynamic>? ?? [];
    return items
        .map((e) => ComplaintListItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> create({
    required String outletId,
    required String description,
    required List<ComplaintLineInput> lines,
  }) async {
    final payload = <String, dynamic>{
      'outletId': outletId,
      'description': description,
      'lines': lines.map((l) => l.toJson()).toList(),
    };

    await _dio.post(
      '/serviceComplaints.create',
      data: jsonEncode({'json': payload}),
      options: Options(headers: {'Content-Type': 'application/json'}),
    );
  }
}

final serviceComplaintsClientProvider =
    Provider<ServiceComplaintsClient>((ref) {
  return ServiceComplaintsClient(ref.watch(dioProvider));
});
