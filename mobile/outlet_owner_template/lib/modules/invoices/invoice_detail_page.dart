import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

final _invoiceDetailProvider = FutureProvider.autoDispose
    .family<InvoiceDetail, ({String outletId, String invoiceId})>(
        (ref, args) async {
  return ref
      .watch(outletPortalClientProvider)
      .invoiceDetail(args.outletId, args.invoiceId);
});

class InvoiceDetailPage extends ConsumerWidget {
  const InvoiceDetailPage({super.key, required this.invoiceId, this.outletId});

  final String invoiceId;
  final String? outletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resolved = (outletId?.isNotEmpty == true ? outletId : null) ??
        ref.watch(outletIdProvider) ??
        '';
    final args = (outletId: resolved, invoiceId: invoiceId);
    final async = ref.watch(_invoiceDetailProvider(args));

    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load invoice.',
          onRetry: () =>
              ref.refresh(_invoiceDetailProvider(args).future),
        ),
        data: (inv) => RefreshIndicator(
          onRefresh: () =>
              ref.refresh(_invoiceDetailProvider(args).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(inv: inv),
              const SizedBox(height: 16),
              _AmountCard(inv: inv),
              const SizedBox(height: 16),
              _LinesCard(lines: inv.lines),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.inv});
  final InvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(inv.invoiceDate);
    final dateStr =
        date != null ? '${date.day}/${date.month}/${date.year}' : inv.invoiceDate;
    final isPaid = double.tryParse(inv.amountDue) == 0;

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
                  inv.invoiceNumber,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isPaid
                        ? Colors.green.shade100
                        : Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    isPaid ? 'PAID' : 'DUE',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isPaid
                          ? Colors.green.shade800
                          : Colors.orange.shade800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _Row('Date', dateStr),
            _Row('Order', inv.orderNumber),
          ],
        ),
      ),
    );
  }
}

class _AmountCard extends StatelessWidget {
  const _AmountCard({required this.inv});
  final InvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Amounts',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            _Row('Subtotal', '₹${inv.subtotal}'),
            _Row('Total', '₹${inv.total}'),
            _Row('Paid', '₹${inv.amountPaid}'),
            const Divider(),
            _Row('Due',
                '₹${inv.amountDue}',
                valueStyle: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: double.tryParse(inv.amountDue) == 0
                      ? Colors.green
                      : Colors.red.shade700,
                )),
          ],
        ),
      ),
    );
  }
}

class _LinesCard extends StatelessWidget {
  const _LinesCard({required this.lines});
  final List<InvoiceLineItem> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Line Items',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: lines.map((l) {
              return ListTile(
                dense: true,
                title: Text(l.sku,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${l.qty} units  ×  ₹${l.unitPrice}'),
                trailing: Text('₹${l.lineTotal}',
                    style: const TextStyle(fontWeight: FontWeight.w500)),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.valueStyle});
  final String label;
  final String value;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 72,
            child: Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.grey)),
          ),
          Expanded(
              child: Text(value,
                  style: valueStyle ??
                      const TextStyle(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
