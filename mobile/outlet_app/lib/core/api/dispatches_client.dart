import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../models/dispatch.dart';

class DispatchesClient {
  final ApiClient _api;
  const DispatchesClient(this._api);

  Future<DispatchDto> markDelivered(
    String dispatchId, {
    String? deliveredAt,
    String? note,
  }) =>
      _api.mutation('dispatches.markDelivered', {
        'id': dispatchId,
        if (deliveredAt != null) 'deliveredAt': deliveredAt,
        if (note != null && note.isNotEmpty) 'note': note,
      }, (j) => DispatchDto.fromJson(j as Map<String, dynamic>));
}

final dispatchesClientProvider = Provider<DispatchesClient>(
  (ref) => DispatchesClient(ref.read(apiClientProvider)),
);
