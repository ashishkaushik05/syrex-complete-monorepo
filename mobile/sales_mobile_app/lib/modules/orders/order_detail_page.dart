import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/error_view.dart';
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
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => ErrorView(
          message: 'Could not load order.',
          onRetry: () => ref.refresh(_orderDetailProvider(orderId).future),
        ),
        data: (order) => RefreshIndicator(
          onRefresh: () => ref.refresh(_orderDetailProvider(orderId).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(order: order),
              const SizedBox(height: 16),
              _Section(
                title: 'Battery Fulfillment',
                child: _FulfillmentTable(lines: order.lines),
              ),
            ],
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

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  order.orderNumber,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
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
        ),
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
          SizedBox(
            width: 80,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

class _FulfillmentTable extends StatelessWidget {
  const _FulfillmentTable({required this.lines});

  final List<SalesOrderLine> lines;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Text('Battery (SKU)', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Colors.grey)),
                ),
                SizedBox(
                  width: 56,
                  child: Text('Ordered', textAlign: TextAlign.center, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Colors.grey)),
                ),
                SizedBox(
                  width: 64,
                  child: Text('Dispatched', textAlign: TextAlign.center, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Colors.grey)),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          ...lines.map((line) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  Expanded(flex: 3, child: Text(line.sku, style: const TextStyle(fontWeight: FontWeight.w600))),
                  SizedBox(width: 56, child: Text('${line.qtyOrdered}', textAlign: TextAlign.center)),
                  SizedBox(width: 64, child: Text('${line.qtyDispatched}', textAlign: TextAlign.center)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
