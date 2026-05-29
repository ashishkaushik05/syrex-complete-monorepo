import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/status_chip.dart';

final _dispatchHistoryProvider = FutureProvider.autoDispose
    .family<PagedResult<LinkedDispatch>, String>((ref, outletId) {
  return ref
      .watch(outletPortalClientProvider)
      .dispatchHistory(outletId, limit: 100);
});

class DispatchHistoryPage extends ConsumerStatefulWidget {
  const DispatchHistoryPage({super.key});

  @override
  ConsumerState<DispatchHistoryPage> createState() =>
      _DispatchHistoryPageState();
}

class _DispatchHistoryPageState extends ConsumerState<DispatchHistoryPage> {
  String _filter = 'all';

  static const _filters = <(String, String)>[
    ('all', 'All'),
    ('created', 'Created'),
    ('in_transit', 'In transit'),
    ('delivered', 'Delivered'),
  ];

  @override
  Widget build(BuildContext context) {
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return const Scaffold(
        body: EmptyState(
          icon: Icons.store_outlined,
          message: 'No outlet linked to this account.',
        ),
      );
    }

    final dispatches = ref.watch(_dispatchHistoryProvider(outletId));

    return Scaffold(
      appBar: AppBar(title: const Text('Dispatches')),
      body: dispatches.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => ErrorView(
          message: 'Could not load dispatches.',
          onRetry: () => ref.refresh(_dispatchHistoryProvider(outletId).future),
        ),
        data: (result) {
          if (result.items.isEmpty) {
            return const EmptyState(
              icon: Icons.local_shipping_outlined,
              message: 'No dispatches yet.',
            );
          }

          final arrivingSoon = result.items
              .where((d) =>
                  d.deliveryStatus == 'in_transit' ||
                  d.deliveryStatus == 'created')
              .length;
          final filtered = result.items
              .where((d) => _filter == 'all' || d.deliveryStatus == _filter)
              .toList();

          return RefreshIndicator(
            onRefresh: () =>
                ref.refresh(_dispatchHistoryProvider(outletId).future),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                  child: Text(
                    '$arrivingSoon arriving soon · ${result.items.length} total',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey.shade600),
                  ),
                ),
                SizedBox(
                  height: 34,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _filters.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 6),
                    itemBuilder: (_, i) {
                      final id = _filters[i].$1;
                      final label = _filters[i].$2;
                      final selected = _filter == id;
                      return ChoiceChip(
                        label: Text(label),
                        selected: selected,
                        onSelected: (_) => setState(() => _filter = id),
                        visualDensity: VisualDensity.compact,
                      );
                    },
                  ),
                ),
                const SizedBox(height: 10),
                if (filtered.isEmpty)
                  const EmptyState(
                    icon: Icons.filter_alt_off,
                    message: 'No dispatches match this filter.',
                  )
                else
                  ...filtered.map((item) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _DispatchCard(item: item),
                      )),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DispatchCard extends StatelessWidget {
  const _DispatchCard({required this.item});

  final LinkedDispatch item;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(item.dispatchDate);
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : item.dispatchDate;
    final eta = item.estimatedDelivery != null
        ? DateTime.tryParse(item.estimatedDelivery!)
        : null;
    final isLive =
        item.deliveryStatus == 'in_transit' || item.deliveryStatus == 'created';

    return Card(
      child: InkWell(
        onTap: () => context.push('/dispatches/${item.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: isLive
                          ? const Color(0xFFEEF2FF)
                          : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Icon(
                      Icons.local_shipping_outlined,
                      size: 18,
                      color: isLive
                          ? const Color(0xFF6366F1)
                          : Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.id.substring(0, 8).toUpperCase(),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '$dateStr  •  ${item.vehicleNumber}',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  ),
                  StatusChip(status: item.deliveryStatus),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.transporterName,
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                  Text(
                    eta == null
                        ? 'ETA TBD'
                        : 'ETA ${eta.day}/${eta.month}/${eta.year}',
                    style: TextStyle(
                      fontSize: 12,
                      color: isLive
                          ? const Color(0xFF6366F1)
                          : Colors.grey.shade600,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
