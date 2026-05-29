import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/sales_client.dart';
import '../../shared/widgets/rb_components.dart';

// ─── Filter chips ──────────────────────────────────────────────────────────────

const _filterLabels = {
  null: 'All',
  'pending_approval': 'Pending',
  'approved': 'Approved',
  'partially_dispatched': 'Part.',
  'fully_dispatched': 'Dispatched',
  'on_hold': 'On hold',
  'rejected': 'Rejected',
};

// ─── Provider ─────────────────────────────────────────────────────────────────

class _OrderFilter {
  const _OrderFilter({this.status, this.q});
  final String? status;
  final String? q;

  @override
  bool operator ==(Object o) =>
      o is _OrderFilter && o.status == status && o.q == q;
  @override
  int get hashCode => Object.hash(status, q);
}

final _orderFilterProvider =
    StateProvider.autoDispose<_OrderFilter>((_) => const _OrderFilter());

final _ordersProvider = FutureProvider.autoDispose
    .family<PagedResult<SalesOrder>, _OrderFilter>((ref, f) {
  return ref.watch(salesClientProvider).myOrders(status: f.status, q: f.q);
});

// ─── Page ──────────────────────────────────────────────────────────────────────

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
    final filter = ref.watch(_orderFilterProvider);
    final async = ref.watch(_ordersProvider(filter));
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          RbTopBar(
            title: 'Orders',
            actions: [
              RbIconBtn(
                icon: Icons.add,
                onTap: () => context.push('/orders/create'),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: RbSearchInput(
              controller: _searchCtrl,
              placeholder: 'Search orders',
              onChanged: (v) => ref.read(_orderFilterProvider.notifier).update(
                    (s) => _OrderFilter(
                        status: s.status, q: v.isEmpty ? null : v),
                  ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: _filterLabels.entries
                  .map((e) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: _FilterPill(
                          label: e.value,
                          selected: filter.status == e.key,
                          onTap: () => ref
                              .read(_orderFilterProvider.notifier)
                              .update((s) =>
                                  _OrderFilter(status: e.key, q: s.q)),
                        ),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: async.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: RbColors.accent)),
              error: (e, _) => RbEmpty(
                  icon: Icons.cloud_off_outlined,
                  title: 'Could not load orders',
                  sub: e.toString()),
              data: (result) {
                if (result.items.isEmpty) {
                  return const RbEmpty(
                    icon: Icons.inventory_2_outlined,
                    title: 'No orders found',
                    sub: 'Try adjusting filters or create a new order.',
                  );
                }
                return RefreshIndicator(
                  color: RbColors.accent,
                  onRefresh: () async =>
                      ref.invalidate(_ordersProvider(filter)),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                    itemCount: result.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (ctx, i) =>
                        _OrderCard(order: result.items[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? c.ink : c.surface,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
            color: selected ? c.ink : c.line,
            width: 0.5,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: selected ? Colors.white : c.ink2,
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final SalesOrder order;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbCard(
      onTap: () => context.push('/orders/${order.id}'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(order.orderNumber,
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: c.ink)),
                const Spacer(),
                StatusChip.order(order.status),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Text(_fmtDate(order.orderDate),
                    style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
                const Spacer(),
                Text(fmtMoney(order.totalValueNum),
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: c.ink)),
              ],
            ),
            if (order.lineCount > 0) ...[
              const SizedBox(height: 4),
              Text('${order.lineCount} item${order.lineCount == 1 ? '' : 's'}',
                  style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
            ],
          ],
        ),
      ),
    );
  }

  static String _fmtDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[dt.month - 1]} ${dt.day}, ${dt.year}';
  }
}
