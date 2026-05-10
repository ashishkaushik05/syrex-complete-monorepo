import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/status_chip.dart';

final _orderDetailProvider = FutureProvider.autoDispose
    .family<OrderDetail, ({String outletId, String orderId})>((ref, args) {
  return ref
      .watch(outletPortalClientProvider)
      .orderDetail(args.outletId, args.orderId);
});

class OrderDetailPage extends ConsumerWidget {
  const OrderDetailPage(
      {super.key, required this.orderId, this.outletId});

  final String orderId;
  final String? outletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resolvedOutletId =
        (outletId?.isNotEmpty == true ? outletId : null) ??
            ref.watch(outletIdProvider) ??
            '';
    final detail = ref.watch(
        _orderDetailProvider((outletId: resolvedOutletId, orderId: orderId)));

    return Scaffold(
      appBar: AppBar(title: const Text('Order Detail')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load order.',
          onRetry: () => ref.refresh(
              _orderDetailProvider(
                      (outletId: resolvedOutletId, orderId: orderId))
                  .future),
        ),
        data: (order) => RefreshIndicator(
          onRefresh: () => ref.refresh(
              _orderDetailProvider(
                      (outletId: resolvedOutletId, orderId: orderId))
                  .future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(order: order),
              const SizedBox(height: 12),
              _OrderProgressBar(status: order.status),
              const SizedBox(height: 16),
              _Section(
                title: 'Battery Fulfillment',
                child: _FulfillmentTable(lines: order.lines),
              ),
              if (order.linkedDispatches.isNotEmpty) ...[
                const SizedBox(height: 16),
                _Section(
                  title: 'Dispatches',
                  child: _DispatchTimeline(
                    dispatches: order.linkedDispatches,
                    outletId: resolvedOutletId,
                  ),
                ),
              ],
              if (order.linkedInvoices.isNotEmpty) ...[
                const SizedBox(height: 16),
                _Section(
                  title: 'Invoice',
                  child: _InvoiceList(
                    invoices: order.linkedInvoices,
                    outletId: resolvedOutletId,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.order});

  final OrderDetail order;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(order.orderDate);
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : order.orderDate;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(order.orderNumber,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
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
            child: Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.grey)),
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
        Text(title,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        child,
      ],
    );
  }
}

// ── Order Progress Bar ────────────────────────────────────────────────────────

class _OrderProgressBar extends StatelessWidget {
  const _OrderProgressBar({required this.status});
  final String status;

  static const _steps = [
    'pending_approval',
    'approved',
    'partially_dispatched',
    'fully_dispatched',
  ];

  static const _labels = ['Pending', 'Approved', 'Dispatching', 'Delivered'];

  static const _terminalColors = {
    'rejected': Colors.red,
    'cancelled': Colors.red,
    'on_hold': Colors.orange,
  };

  @override
  Widget build(BuildContext context) {
    final terminalColor = _terminalColors[status];
    if (terminalColor != null) {
      return Card(
        color: terminalColor.withOpacity(0.08),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: terminalColor, size: 18),
              const SizedBox(width: 8),
              Text(
                'Order ${status.replaceAll('_', ' ').toUpperCase()}',
                style: TextStyle(
                    fontWeight: FontWeight.bold, color: terminalColor),
              ),
            ],
          ),
        ),
      );
    }

    final activeIdx = _steps.indexOf(status);

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Row(
          children: List.generate(_steps.length * 2 - 1, (i) {
            if (i.isOdd) {
              final stepIdx = i ~/ 2;
              final done = stepIdx < activeIdx;
              return Expanded(
                child: Container(
                  height: 3,
                  color: done
                      ? Theme.of(context).colorScheme.primary
                      : Colors.grey.shade300,
                ),
              );
            }
            final stepIdx = i ~/ 2;
            final done = stepIdx <= activeIdx;
            final active = stepIdx == activeIdx;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: done
                        ? Theme.of(context).colorScheme.primary
                        : Colors.grey.shade300,
                  ),
                  child: done
                      ? const Icon(Icons.check, size: 14, color: Colors.white)
                      : null,
                ),
                const SizedBox(height: 4),
                Text(
                  _labels[stepIdx],
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight:
                        active ? FontWeight.bold : FontWeight.normal,
                    color: done
                        ? Theme.of(context).colorScheme.primary
                        : Colors.grey,
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}

// ── Battery Fulfillment ───────────────────────────────────────────────────────

class _FulfillmentTable extends StatelessWidget {
  const _FulfillmentTable({required this.lines});
  final List<OrderLine> lines;

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
                    child: Text('Battery (SKU)',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(color: Colors.grey))),
                SizedBox(
                    width: 56,
                    child: Text('Ordered',
                        textAlign: TextAlign.center,
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(color: Colors.grey))),
                SizedBox(
                    width: 64,
                    child: Text('Dispatched',
                        textAlign: TextAlign.center,
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(color: Colors.grey))),
              ],
            ),
          ),
          const Divider(height: 1),
          ...lines.map((line) {
            final pct = line.qtyOrdered > 0
                ? line.qtyDispatched / line.qtyOrdered
                : 0.0;
            final isFull = line.qtyDispatched >= line.qtyOrdered;
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 10),
                  child: Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(line.sku,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(3),
                              child: LinearProgressIndicator(
                                value: pct.clamp(0.0, 1.0),
                                minHeight: 5,
                                backgroundColor: Colors.grey.shade200,
                                color: isFull
                                    ? Colors.green
                                    : Colors.blue.shade400,
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                          width: 56,
                          child: Text('${line.qtyOrdered}',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.black54))),
                      SizedBox(
                        width: 64,
                        child: Center(
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: isFull
                                  ? Colors.green.shade100
                                  : Colors.blue.shade100,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              '${line.qtyDispatched}',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: isFull
                                    ? Colors.green.shade800
                                    : Colors.blue.shade800,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
              ],
            );
          }),
        ],
      ),
    );
  }
}

// ── Dispatch Timeline ─────────────────────────────────────────────────────────

class _DispatchTimeline extends StatelessWidget {
  const _DispatchTimeline(
      {required this.dispatches, required this.outletId});

  final List<LinkedDispatch> dispatches;
  final String outletId;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: dispatches.map((d) {
          final date = DateTime.tryParse(d.dispatchDate);
          final dateStr = date != null
              ? '${date.day}/${date.month}/${date.year}'
              : d.dispatchDate;
          return ListTile(
            dense: true,
            leading: const Icon(Icons.local_shipping_outlined),
            title: Text('${d.transporterName} • ${d.vehicleNumber}'),
            subtitle: Text(
                '$dateStr  •  ${d.deliveryStatus.replaceAll('_', ' ')}${d.lrNumber != null ? '  •  LR: ${d.lrNumber}' : ''}'),
            trailing: const Icon(Icons.chevron_right, size: 18),
            onTap: () => context.push(
              '/dispatches/${d.id}',
              extra: {'outletId': outletId},
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Invoice List ──────────────────────────────────────────────────────────────

class _InvoiceList extends StatelessWidget {
  const _InvoiceList({required this.invoices, required this.outletId});

  final List<LinkedInvoice> invoices;
  final String outletId;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: invoices.map((inv) {
          final date = DateTime.tryParse(inv.invoiceDate);
          final dateStr = date != null
              ? '${date.day}/${date.month}/${date.year}'
              : inv.invoiceDate;
          final isPaid = double.tryParse(inv.amountDue) == 0;
          return ListTile(
            dense: true,
            leading: const Icon(Icons.receipt_outlined),
            title: Text(inv.invoiceNumber,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(isPaid
                ? '$dateStr  •  PAID'
                : '$dateStr  •  Due: ₹${inv.amountDue}'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('₹${inv.total}',
                    style: const TextStyle(fontWeight: FontWeight.w500)),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, size: 18),
              ],
            ),
            onTap: () => context.push(
              '/invoices/${inv.id}',
              extra: {'outletId': outletId},
            ),
          );
        }).toList(),
      ),
    );
  }
}
