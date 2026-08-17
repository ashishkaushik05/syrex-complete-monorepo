import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../models/payment.dart';

class PaymentsClient {
  final ApiClient _api;
  const PaymentsClient(this._api);

  Future<PagedPayments> list({String? cursor, int limit = 20}) =>
      _api.query('payments.list', {
        'limit': limit,
        if (cursor != null) 'cursor': cursor,
      }, (j) => PagedPayments.fromJson(j as Map<String, dynamic>));

  Future<PaymentDetailDto> getById(String id) =>
      _api.query('payments.getById', {'id': id},
          (j) => PaymentDetailDto.fromJson(j as Map<String, dynamic>));
}

final paymentsClientProvider = Provider<PaymentsClient>(
  (ref) => PaymentsClient(ref.read(apiClientProvider)),
);
