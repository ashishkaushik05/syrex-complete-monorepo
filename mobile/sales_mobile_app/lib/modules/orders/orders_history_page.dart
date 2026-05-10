import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/status_chip.dart';

const _statuses = [
  'pending_approval',
  'approved',
  'partially_dispatched',
  'fully_dispatched',
  'rejected',
  'cancelled',
  'on_hold',
];

class _FilterState {
  const _FilterState({this.status, this.q});

  final String? status;
  final String? q;
}

final _filterProvider = StateProvider.autoDispose<_FilterState>((_) => const _FilterState());

final _ordersProvider = FutureProvider.autoDispose.family<PagedResult<SalesOrder>, _FilterState>((ref, filter) async {
  return ref.watch(salesClientProvider).myOrders(status: filter.status, q: filter.q);
});

class OrdersHistoryPage extends ConsumerStatefulWidget {
  const OrdersHistoryPage({super.key});

  @override
  ConsumerState<OrdersHistoryPage> createState() => _OrdersHistoryPageState();
}

class _OrdersHistoryPageState extends ConsumerState<OrdersHistoryPage> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(_filterProvider);
    final orders = ref.watch(_ordersProvider(filter));

    return Scaffold(
      appBar: AppBar(title: const Text('My Orders')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search orders…',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          ref.read(_filterProvider.notifier).state = _FilterState(status: filter.status);
                        },
                      )
                    : null,
              ),
              onChanged: (v) => ref.read(_filterProvider.notifier).state = _FilterState(
                status: filter.status,
                q: v.isEmpty ? null : v,
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                _FilterChip(
                  label: 'All',
                  selected: filter.status == null,
                  onTap: () => ref.read(_filterProvider.notifier).state = _FilterState(q: filter.q),
                ),
                ..._statuses.map((s) => _FilterChip(
                      label: _label(s),
                      selected: filter.status == s,
                      onTap: () => ref.read(_filterProvider.notifier).state = _FilterState(status: s, q: filter.q),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: orders.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => ErrorView(
                message: 'Could not load orders.',
                onRetry: () => ref.refresh(_ordersProvider(filter).future),
              ),
              data: (result) {
                if (result.items.isEmpty) {
                  return const Center(child: Text('No orders found.'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 80),
                  itemCount: result.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _OrderCard(order: result.items[i]),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/orders/create'),
        icon: const Icon(Icons.add),
        label: const Text('New Order'),
      ),
    );
  }
}

String _label(String s) => s.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label, style: const TextStyle(fontSize: 12)),
        selected: selected,
        onSelected: (_) => onTap(),
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final SalesOrder order;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(order.orderDate);
    final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : order.orderDate;

    return Card(
      child: ListTile(
        title: Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(dateStr),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            StatusChip(status: order.status),
            const SizedBox(height: 4),
            Text('₹${order.totalValue}', style: const TextStyle(fontWeight: FontWeight.w500)),
          ],
        ),
        onTap: () => context.push('/orders/${order.id}'),
      ),
    );
  }
}
