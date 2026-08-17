import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/order.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/order_list_tile.dart';
import '../../shared/widgets/filter_chip_row.dart';
import '../../shared/widgets/empty_state.dart';
import '../../app/theme_provider.dart';

final _ordersProvider = FutureProvider.autoDispose
    .family<PagedOrders, ({String outletId, String? status})>(
  (ref, args) => ref.read(outletPortalClientProvider).orderHistory(
        args.outletId,
        status: args.status == 'all' ? null : args.status,
      ),
);

class OrdersListScreen extends ConsumerStatefulWidget {
  final String? initialFilter;
  const OrdersListScreen({super.key, this.initialFilter});

  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  late String _filter;

  static const _chips = ['all', 'pending_approval', 'approved', 'dispatched', 'cancelled'];

  @override
  void initState() {
    super.initState();
    _filter = widget.initialFilter ?? 'all';
  }

  @override
  Widget build(BuildContext context) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final outletId = ref.watch(sessionControllerProvider).outletId;
    final ordersAsync = ref.watch(_ordersProvider((outletId: outletId, status: _filter)));

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutletAppBar(title: 'Orders', c: c),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
            child: FilterChipRow(
              chips: _chips,
              selected: _filter,
              onSelect: (f) => setState(() => _filter = f),
              c: c,
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () async => ref.invalidate(_ordersProvider),
              child: ordersAsync.when(
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: 'No orders',
                          sub: 'Orders placed will appear here.',
                          c: c,
                          actionLabel: 'Place an order',
                          onAction: () => context.push('/orders/new'),
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                    itemCount: page.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => OrderListTile(
                      order: page.items[i],
                      onTap: () => context.push('/orders/${page.items[i].id}'),
                      c: c,
                    ),
                  );
                },
                loading: () => _Skeleton(c: c),
                error: (e, _) => Center(
                  child: Text('Failed to load orders', style: TextStyle(color: c.textMute)),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/orders/new'),
        backgroundColor: c.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('New order'),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  final AppThemeColors c;
  const _Skeleton({required this.c});

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        itemCount: 6,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, __) => Container(
          height: 88,
          decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(18)),
        ),
      );
}
