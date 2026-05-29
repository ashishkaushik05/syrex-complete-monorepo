import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/service_complaints_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/status_chip.dart';

final _complaintsProvider = FutureProvider.autoDispose
    .family<List<ComplaintListItem>, String>((ref, outletId) {
  return ref.watch(serviceComplaintsClientProvider).list(outletId);
});

class ComplaintListPage extends ConsumerWidget {
  const ComplaintListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return const Scaffold(
        body: EmptyState(
          icon: Icons.store_outlined,
          message: 'No outlet linked to this account.',
        ),
      );
    }

    final complaints = ref.watch(_complaintsProvider(outletId));

    return Scaffold(
      appBar: AppBar(title: const Text('Service Complaints')),
      body: complaints.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load complaints.',
          onRetry: () =>
              ref.refresh(_complaintsProvider(outletId).future),
        ),
        data: (items) {
          if (items.isEmpty) {
            return EmptyState(
              icon: Icons.support_agent_outlined,
              message: 'No service complaints yet.',
              action: () => context.push('/complaints/raise'),
              actionLabel: 'Raise Complaint',
            );
          }
          return RefreshIndicator(
            onRefresh: () =>
                ref.refresh(_complaintsProvider(outletId).future),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _ComplaintCard(item: items[i]),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/complaints/raise'),
        icon: const Icon(Icons.add),
        label: const Text('Raise Complaint'),
      ),
    );
  }
}

class _ComplaintCard extends StatelessWidget {
  const _ComplaintCard({required this.item});
  final ComplaintListItem item;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(item.createdAt);
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : item.createdAt;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const Icon(Icons.build_circle_outlined,
                size: 28, color: Colors.blueGrey),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Complaint #${item.id.substring(0, 8)}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    dateStr,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            StatusChip(status: item.status),
          ],
        ),
      ),
    );
  }
}
