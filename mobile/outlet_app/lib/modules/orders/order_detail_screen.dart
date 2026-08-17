import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/order.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/status_badge.dart';
import '../../shared/widgets/kv_row.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_button.dart';
import '../../app/theme_provider.dart';

final _orderDetailProvider =
    FutureProvider.autoDispose.family<OrderDto, ({String outletId, String orderId})>(
  (ref, args) =>
      ref.read(outletPortalClientProvider).orderDetail(args.outletId, args.orderId),
);

class OrderDetailScreen extends ConsumerWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final outletId = ref.watch(sessionControllerProvider).outletId;
    final args = (outletId: outletId, orderId: orderId);
    final orderAsync = ref.watch(_orderDetailProvider(args));

    return Scaffold(
      backgroundColor: c.bg,
      body: orderAsync.when(
        data: (order) => _Body(order: order, c: c, ref: ref, args: args),
        loading: () => _Loading(c: c),
        error: (e, _) => Center(child: Text('Failed to load order', style: TextStyle(color: c.textMute))),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final OrderDto order;
  final AppThemeColors c;
  final WidgetRef ref;
  final ({String outletId, String orderId}) args;

  const _Body({required this.order, required this.c, required this.ref, required this.args});

  String _mapStatus(String s) {
    if (s == 'pending_approval') return 'pending';
    if (s == 'fully_dispatched' || s == 'partially_dispatched') return 'dispatched';
    return s;
  }

  void _refresh() => ref.invalidate(_orderDetailProvider(args));

  @override
  Widget build(BuildContext context) {
    final canCancel = order.status == 'pending_approval' || order.status == 'approved';

    return RefreshIndicator(
      color: c.accent,
      onRefresh: () async => _refresh(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: OutletAppBar(
              title: '#${order.orderNumber}',
              subtitle: 'ORDER',
              c: c,
              showBack: true,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  StatusBadge(status: _mapStatus(order.status), c: c),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: _refresh,
                    child: Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: c.line),
                      ),
                      child: Icon(Icons.refresh_rounded, size: 18, color: c.textMute),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                AppCard(
                  c: c,
                  child: Column(
                    children: [
                      KVRow(label: 'Order date', value: fmtDateStr(order.orderDate), c: c),
                      KVRow(label: 'Priority', value: order.priority, c: c),
                      KVRow(label: 'Delivery address', value: order.deliveryAddress, c: c),
                      if (order.notes != null)
                        KVRow(label: 'Notes', value: order.notes!, c: c),
                      if (order.rejectionReason != null)
                        KVRow(label: 'Rejection reason', value: order.rejectionReason!, c: c, valueColor: c.red),
                      KVRow(label: 'Subtotal', value: fmtINR(parseAmount(order.subtotalValue)), c: c),
                      KVRow(label: 'Tax', value: fmtINR(parseAmount(order.taxTotal)), c: c),
                      KVTotalRow(label: 'Total', value: fmtINR(parseAmount(order.totalValue)), c: c),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text('Items', style: AppTextStyles.sectionTitle(color: c.text)),
                const SizedBox(height: 10),
                ...order.lines.map((line) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    c: c,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(line.sku, style: AppTextStyles.bodyHeavy(color: c.text)),
                            ),
                            StatusBadge(status: line.status, c: c),
                          ],
                        ),
                        const SizedBox(height: 8),
                        KVRow(label: 'Qty ordered', value: '${line.qtyOrdered}', c: c),
                        KVRow(label: 'Qty dispatched', value: '${line.qtyDispatched}', c: c),
                        KVRow(label: 'Unit price', value: fmtINR(parseAmount(line.unitPrice)), c: c),
                        KVRow(label: 'Line total', value: fmtINR(parseAmount(line.lineTotal)), c: c, last: true),
                      ],
                    ),
                  ),
                )),
                if (canCancel) ...[
                  const SizedBox(height: 24),
                  AppButton(
                    label: 'Cancel order',
                    onTap: () => _confirmCancel(context),
                    c: c,
                    variant: AppButtonVariant.danger,
                    fullWidth: true,
                  ),
                ],
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel order?'),
        content: const Text('This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep')),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              await ref.read(outletPortalClientProvider).cancel(args.outletId, order.id);
              _refresh();
            },
            child: Text('Cancel order', style: TextStyle(color: c.red)),
          ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  final AppThemeColors c;
  const _Loading({required this.c});

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(18),
        children: List.generate(
          4,
          (_) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(height: 60, decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(16))),
          ),
        ),
      );
}
