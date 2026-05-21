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

  @override
  bool operator ==(Object other) =>
      other is _FilterState && other.status == status && other.q == q;

  @override
  int get hashCode => Object.hash(status, q);
}

class _OrdersListState {
  const _OrdersListState({
    this.items = const [],
    this.nextCursor,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  final List<SalesOrder> items;
  final String? nextCursor;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;

  _OrdersListState copyWith({
    List<SalesOrder>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool clearError = false,
  }) =>
      _OrdersListState(
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        error: clearError ? null : (error ?? this.error),
      );
}

class _OrdersNotifier extends AutoDisposeFamilyNotifier<_OrdersListState, _FilterState> {
  @override
  _OrdersListState build(_FilterState arg) {
    _fetch();
    return const _OrdersListState(isLoading: true);
  }

  Future<void> _fetch() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await ref
          .read(salesClientProvider)
          .myOrders(status: arg.status, q: arg.q);
      state = state.copyWith(
        items: result.items,
        nextCursor: result.nextCursor,
        clearCursor: result.nextCursor == null,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.nextCursor == null || state.isLoadingMore) return;
    final cursor = state.nextCursor;
    state = state.copyWith(isLoadingMore: true);
    try {
      final result = await ref
          .read(salesClientProvider)
          .myOrders(status: arg.status, q: arg.q, cursor: cursor);
      state = state.copyWith(
        items: [...state.items, ...result.items],
        nextCursor: result.nextCursor,
        clearCursor: result.nextCursor == null,
        isLoadingMore: false,
      );
    } catch (_) {
      state = state.copyWith(isLoadingMore: false);
    }
  }

  Future<void> refresh() async {
    state = const _OrdersListState(isLoading: true);
    await _fetch();
  }
}

final _ordersNotifierProvider = NotifierProvider.autoDispose
    .family<_OrdersNotifier, _OrdersListState, _FilterState>(
  _OrdersNotifier.new,
);

final _filterProvider = StateProvider.autoDispose<_FilterState>((_) => const _FilterState());

class OrdersHistoryPage extends ConsumerStatefulWidget {
  const OrdersHistoryPage({super.key});

  @override
  ConsumerState<OrdersHistoryPage> createState() => _OrdersHistoryPageState();
}

class _OrdersHistoryPageState extends ConsumerState<OrdersHistoryPage> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
      final filter = ref.read(_filterProvider);
      ref.read(_ordersNotifierProvider(filter).notifier).loadMore();
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(_filterProvider);
    final state = ref.watch(_ordersNotifierProvider(filter));

    return PremiumGradientBackground(
      child: RefreshIndicator(
        onRefresh: () => ref.read(_ordersNotifierProvider(filter).notifier).refresh(),
        child: CustomScrollView(
          controller: _scrollCtrl,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Orders',
                      style: TextStyle(
                          fontSize: 28, fontWeight: FontWeight.w800, color: AppPalette.ink),
                    ),
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
                                  ref.read(_filterProvider.notifier).state =
                                      _FilterState(status: filter.status);
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
                            onTap: () => ref.read(_filterProvider.notifier).state =
                                _FilterState(q: filter.q),
                          ),
                          ..._statuses.map(
                            (status) => _StatusFilterChip(
                              label: _label(status),
                              selected: filter.status == status,
                              onTap: () => ref.read(_filterProvider.notifier).state =
                                  _FilterState(status: status, q: filter.q),
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
            if (state.isLoading)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (state.error != null)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyStateView(
                    title: 'Could not load orders',
                    subtitle: 'Pull to refresh and try again.',
                    icon: Icons.sync_problem,
                  ),
                ),
              )
            else if (state.items.isEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyStateView(
                    title: 'No orders found',
                    subtitle: 'Try removing filters or create a new order.',
                    icon: Icons.inventory_2_outlined,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                sliver: SliverList.separated(
                  itemCount: state.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _OrderCard(order: state.items[i]),
                ),
              ),
            if (state.isLoadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (!state.isLoading && state.nextCursor != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  child: OutlinedButton(
                    onPressed: () =>
                        ref.read(_ordersNotifierProvider(filter).notifier).loadMore(),
                    child: const Text('Load More'),
                  ),
                ),
              )
            else
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
    );
  }
}

class _StatusFilterChip extends StatelessWidget {
  const _StatusFilterChip(
      {required this.label, required this.selected, required this.onTap});

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
    final dateStr =
        date != null ? '${date.day}/${date.month}/${date.year}' : order.orderDate;

    return PremiumCard(
      margin: const EdgeInsets.only(bottom: 0),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(order.orderNumber,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(dateStr),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            StatusChip(status: order.status),
            const SizedBox(height: 4),
            Text('₹${order.totalValue}',
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        onTap: () => context.push('/orders/${order.id}'),
      ),
    );
  }
}
