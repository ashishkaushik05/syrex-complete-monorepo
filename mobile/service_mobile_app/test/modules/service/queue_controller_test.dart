import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:service_mobile_app/core/network/api_client.dart';
import 'package:service_mobile_app/modules/service/controllers/service_controllers.dart';
import 'package:service_mobile_app/modules/service/models/service_models.dart';
import 'package:service_mobile_app/modules/service/repository/service_repository.dart';

class PagingRepository extends ServiceRepository {
  PagingRepository() : super(TrpcClient(Dio()));

  @override
  Future<ComplaintPage> listComplaints({
    String? status,
    String? query,
    String? cursor,
  }) async {
    return ComplaintPage(
      items: [_item(cursor == null ? '1' : '2')],
      nextCursor: cursor == null ? 'next' : null,
      counts: const {'all': 2},
    );
  }

  ComplaintSummary _item(String id) => ComplaintSummary(
        id: id,
        number: 'CMP-$id',
        status: 'assigned',
        issueCategory: 'Battery',
        customerName: 'Customer',
        customerPhone: '12345',
        serials: const ['S1'],
        assignedAsiName: 'ASI',
        assignedSeName: 'Engineer',
        updatedAt: DateTime(2026),
      );
}

void main() {
  test('queue controller appends cursor pages without replacing existing rows',
      () async {
    final controller = QueueController(PagingRepository());
    await Future<void>.delayed(Duration.zero);
    expect(controller.state.items.map((item) => item.id), ['1']);
    expect(controller.state.nextCursor, 'next');
    await controller.loadMore();
    expect(controller.state.items.map((item) => item.id), ['1', '2']);
    expect(controller.state.nextCursor, isNull);
  });
}
