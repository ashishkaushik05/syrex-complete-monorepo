import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/sales_client.dart';
import '../../shared/widgets/rb_components.dart';

final _orderDetailProvider =
    FutureProvider.autoDispose.family<SalesOrder, String>((ref, id) {
  return ref.watch(salesClientProvider).getOrderById(id);
});

class OrderDetailPage extends ConsumerWidget {
  const OrderDetailPage({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_orderDetailProvider(orderId));
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                strokeWidth: 2, color: RbColors.accent)),
        error: (e, _) => Center(
            child: RbEmpty(
                icon: Icons.error_outline,
                title: 'Order not found',
                sub: e.toString())),
        data: (order) => _OrderDetail(order: order),
      ),
    );
  }
}

class _OrderDetail extends StatelessWidget {
  const _OrderDetail({required this.order});
  final SalesOrder order;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RefreshIndicator(
      color: RbColors.accent,
      onRefresh: () async {},
      child: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            backgroundColor: c.surface,
            leading: IconButton(
              icon: Icon(Icons.arrow_back, color: c.ink),
              onPressed: () => context.pop(),
            ),
            title: Text(order.orderNumber,
                style: GoogleFonts.jetBrainsMono(
                    fontSize: 14, color: c.ink)),
            actions: [
              IconButton(
                icon: Icon(Icons.description_outlined, color: c.muted),
                onPressed: () {},
              ),
            ],
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Hero card
                RbCard(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(fmtMoney(order.totalValueNum),
                                style: GoogleFonts.inter(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w700,
                                    color: c.ink,
                                    fontFeatures: const [
                                      FontFeature.tabularFigures()
                                    ])),
                            const Spacer(),
                            StatusChip.order(order.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _InfoRow(label: 'Order date', value: _fmtDate(order.orderDate), colors: c),
                        if (order.outletName != null)
                          _InfoRow(label: 'Outlet', value: order.outletName!, colors: c),
                        if (order.deliveryAddress.isNotEmpty)
                          _InfoRow(label: 'Delivery', value: order.deliveryAddress, colors: c),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Items
                RbSection(label: 'Items (${order.lineCount})'),
                const SizedBox(height: 8),
                RbCard(
                  child: Column(
                    children: [
                      for (int i = 0; i < order.lines.length; i++)
                        _LineRow(line: order.lines[i], isFirst: i == 0),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Totals
                RbSection(label: 'Order total'),
                const SizedBox(height: 8),
                RbCard(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      children: [
                        if (order.subtotalNum > 0)
                          RbKvRow(k: 'Subtotal', v: fmtMoney(order.subtotalNum)),
                        if (order.discountNum > 0)
                          RbKvRow(k: 'Discount', v: '−${fmtMoney(order.discountNum)}'),
                        if (order.taxNum > 0)
                          RbKvRow(k: 'Tax', v: fmtMoney(order.taxNum)),
                        ...order.taxBreakdown.map(
                            (t) => RbKvRow(k: t.k, v: fmtMoney(t.v))),
                        const Divider(height: 16, thickness: 0.5),
                        RbKvRow(
                            k: 'Total',
                            v: fmtMoney(order.totalValueNum),
                            bold: true),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Linked invoices
                if (order.linkedInvoices.isNotEmpty) ...[
                  RbSection(label: 'Invoices'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Column(
                      children: [
                        for (int i = 0;
                            i < order.linkedInvoices.length;
                            i++)
                          RbRow(
                            isFirst: i == 0,
                            onTap: () => context
                                .push('/finance/invoices/${order.linkedInvoices[i].id}'),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(order.linkedInvoices[i].code,
                                      style: GoogleFonts.jetBrainsMono(
                                          fontSize: 13, color: c.ink)),
                                ),
                                StatusChip.invoice(order.linkedInvoices[i].status),
                                const SizedBox(width: 8),
                                Text(fmtMoney(order.linkedInvoices[i].amount),
                                    style: GoogleFonts.inter(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: c.ink)),
                                const SizedBox(width: 4),
                                Icon(Icons.chevron_right,
                                    size: 16, color: c.muted),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Linked dispatches
                if (order.linkedDispatches.isNotEmpty) ...[
                  RbSection(label: 'Dispatches'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Column(
                      children: [
                        for (int i = 0;
                            i < order.linkedDispatches.length;
                            i++)
                          RbRow(
                            isFirst: i == 0,
                            onTap: () => context.push(
                                '/dispatches/${order.linkedDispatches[i].id}'),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(order.linkedDispatches[i].code,
                                      style: GoogleFonts.jetBrainsMono(
                                          fontSize: 13, color: c.ink)),
                                ),
                                RbChip(
                                    label: order.linkedDispatches[i].status,
                                    tone: RbTone.neutral),
                                const SizedBox(width: 4),
                                Icon(Icons.chevron_right,
                                    size: 16, color: c.muted),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ]),
            ),
          ),
        ],
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

class _InfoRow extends StatelessWidget {
  const _InfoRow(
      {required this.label, required this.value, required this.colors});
  final String label;
  final String value;
  final RbThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(label,
                style: GoogleFonts.inter(fontSize: 12, color: colors.muted)),
          ),
          Expanded(
            child: Text(value,
                style: GoogleFonts.inter(fontSize: 13, color: colors.ink2)),
          ),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line, required this.isFirst});
  final SalesOrderLine line;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.productName ?? line.sku,
                    style: GoogleFonts.inter(
                        fontSize: 14, fontWeight: FontWeight.w500, color: c.ink)),
                Text(line.sku,
                    style: GoogleFonts.jetBrainsMono(fontSize: 11, color: c.muted)),
              ],
            ),
          ),
          RbChip(label: 'Qty ${line.qtyOrdered}', tone: RbTone.neutral),
          const SizedBox(width: 8),
          if (line.qtyDispatched > 0)
            RbChip(
                label: '${line.qtyDispatched} sent',
                tone: RbTone.success),
          const SizedBox(width: 8),
          Text(fmtMoney(line.lineTotalNum),
              style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
        ],
      ),
    );
  }
}
