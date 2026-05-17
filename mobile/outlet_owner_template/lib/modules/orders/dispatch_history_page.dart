import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

final _dispatchHistoryProvider = FutureProvider.autoDispose
    .family<PagedResult<LinkedDispatch>, String>((ref, outletId) {
  return ref.watch(outletPortalClientProvider).dispatchHistory(outletId);
});

class DispatchHistoryPage extends ConsumerWidget {
  const DispatchHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Dispatches')),
        body: const ErrorView(message: 'No outlet linked to this account.'),
      );
    }

    final dispatches = ref.watch(_dispatchHistoryProvider(outletId));

    return Scaffold(
      appBar: AppBar(title: const Text('Dispatch History')),
      body: dispatches.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => ErrorView(
          message: 'Could not load dispatches.',
          onRetry: () => ref.refresh(_dispatchHistoryProvider(outletId).future),
        ),
        data: (result) {
          if (result.items.isEmpty) {
            return const Center(child: Text('No dispatches found.'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(_dispatchHistoryProvider(outletId).future),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              itemCount: result.items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _DispatchCard(item: result.items[i], outletId: outletId),
            ),
          );
        },
      ),
    );
  }
}

class _DispatchCard extends StatelessWidget {
  const _DispatchCard({required this.item, required this.outletId});

  final LinkedDispatch item;
  final String outletId;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(item.dispatchDate);
    final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : item.dispatchDate;

    final statusColor = switch (item.deliveryStatus) {
      'delivered' => Colors.green,
      'in_transit' => Colors.blue,
      _ => Colors.orange,
    };

    return Card(
      child: ListTile(
        title: Text(
          item.transporterName,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text('$dateStr  •  ${item.vehicleNumber}'),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: statusColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            item.deliveryStatus.toUpperCase().replaceAll('_', ' '),
            style: TextStyle(
              color: statusColor,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        onTap: () => context.push(
          '/dispatches/${item.id}',
          extra: {'outletId': outletId},
        ),
      ),
    );
  }
}
