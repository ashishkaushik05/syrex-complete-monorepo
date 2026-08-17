import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../models/order.dart';

class OrdersClient {
  final ApiClient _api;
  const OrdersClient(this._api);

  Future<OrderDto> create(CreateOrderInput input) =>
      _api.mutation('orders.create', input.toJson(),
          (j) => OrderDto.fromJson(j as Map<String, dynamic>));

  Future<OrderDto> cancel(String orderId, {String? note}) =>
      _api.mutation('orders.transition', {
        'id': orderId,
        'action': 'cancel',
        if (note != null) 'note': note,
      }, (j) => OrderDto.fromJson(j as Map<String, dynamic>));
}

final ordersClientProvider = Provider<OrdersClient>(
  (ref) => OrdersClient(ref.read(apiClientProvider)),
);
