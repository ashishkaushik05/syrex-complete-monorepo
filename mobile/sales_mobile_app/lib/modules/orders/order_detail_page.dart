import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/premium_surfaces.dart';
import '../../shared/widgets/status_chip.dart';

final _orderDetailProvider = FutureProvider.autoDispose.family<SalesOrder, String>((ref, orderId) {
  return ref.watch(salesClientProvider).getOrderById(orderId);
});

class OrderDetailPage extends ConsumerWidget {
  const OrderDetailPage({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(_orderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(title: const Text('Order Detail')),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        color: Colors.white,
        child: FilledButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back),
          label: const Text('Back To Orders'),
        ),
      ),
      body: PremiumGradientBackground(
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => const EmptyStateView(
            title: 'Order not available',
            subtitle: 'Retry from orders list.',
            icon: Icons.error_outline,
          ),
          data: (order) => RefreshIndicator(
            onRefresh: () => ref.refresh(_orderDetailProvider(orderId).future),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              children: [
                PremiumCard(child: _Header(order: order)),
                PremiumCard(child: _Timeline(order: order)),
                PremiumCard(child: _FulfillmentTable(lines: order.lines)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.order});

  final SalesOrder order;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(order.orderDate);
    final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : order.orderDate;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            StatusChip(status: order.status),
          ],
        ),
        const SizedBox(height: 8),
        _Row('Date', dateStr),
        _Row('Total', '₹${order.totalValue}'),
        _Row('Priority', order.priority.toUpperCase()),
        _Row('Delivery', order.deliveryAddress),
        if (order.notes != null) _Row('Notes', order.notes!),
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.order});

  final SalesOrder order;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Timeline', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 8),
        _TimelineRow(title: 'Order Created', subtitle: order.orderDate),
        _TimelineRow(title: 'Status', subtitle: order.status.replaceAll('_', ' ')),
        const _TimelineRow(title: 'Dispatch Linkage', subtitle: 'Check dispatched quantities per line below.'),
      ],
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 4),
            decoration: const BoxDecoration(color: AppPalette.info, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(subtitle, style: const TextStyle(color: Color(0xFF667582))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 90, child: Text(label, style: const TextStyle(color: Color(0xFF677684)))),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

class _FulfillmentTable extends StatelessWidget {
  const _FulfillmentTable({required this.lines});

  final List<SalesOrderLine> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Line Fulfillment', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 8),
        ...lines.map(
          (line) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FBFD),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(line.sku, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('Ordered ${line.qtyOrdered} • Dispatched ${line.qtyDispatched}'),
                    ],
                  ),
                ),
                Text('₹${line.lineTotal}', style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
