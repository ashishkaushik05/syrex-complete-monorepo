import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/premium_surfaces.dart';
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

    return PremiumGradientBackground(
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(_ordersProvider(filter).future),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Orders', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppPalette.ink)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _searchCtrl,
                      decoration: InputDecoration(
                        hintText: 'Search by order number or status',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _searchCtrl.text.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  ref.read(_filterProvider.notifier).state = _FilterState(status: filter.status);
                                  setState(() {});
                                },
                              ),
                      ),
                      onChanged: (value) {
                        ref.read(_filterProvider.notifier).state = _FilterState(
                          status: filter.status,
                          q: value.isEmpty ? null : value,
                        );
                        setState(() {});
                      },
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 38,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          _StatusFilterChip(
                            label: 'All',
                            selected: filter.status == null,
                            onTap: () => ref.read(_filterProvider.notifier).state = _FilterState(q: filter.q),
                          ),
                          ..._statuses.map(
                            (status) => _StatusFilterChip(
                              label: _label(status),
                              selected: filter.status == status,
                              onTap: () => ref.read(_filterProvider.notifier).state = _FilterState(status: status, q: filter.q),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    QuickActionRail(
                      actions: [
                        QuickActionItem(
                          label: 'Create Order',
                          icon: Icons.add_shopping_cart_rounded,
                          onTap: () => context.push('/orders/create'),
                        ),
                        QuickActionItem(
                          label: 'Field Map',
                          icon: Icons.map_outlined,
                          onTap: () => context.push('/field/map'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            orders.when(
              loading: () => const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
              error: (_, __) => const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyStateView(
                    title: 'Could not load orders',
                    subtitle: 'Pull to refresh and try again.',
                    icon: Icons.sync_problem,
                  ),
                ),
              ),
              data: (result) {
                if (result.items.isEmpty) {
                  return const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: EmptyStateView(
                        title: 'No orders found',
                        subtitle: 'Try removing filters or create a new order.',
                        icon: Icons.inventory_2_outlined,
                      ),
                    ),
                  );
                }

                return SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  sliver: SliverList.separated(
                    itemCount: result.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _OrderCard(order: result.items[i]),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusFilterChip extends StatelessWidget {
  const _StatusFilterChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(label: Text(label), selected: selected, onSelected: (_) => onTap()),
    );
  }
}

String _label(String s) => s.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final SalesOrder order;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(order.orderDate);
    final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : order.orderDate;

    return PremiumCard(
      margin: const EdgeInsets.only(bottom: 0),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(dateStr),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            StatusChip(status: order.status),
            const SizedBox(height: 4),
            Text('₹${order.totalValue}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        onTap: () => context.push('/orders/${order.id}'),
      ),
    );
  }
}
