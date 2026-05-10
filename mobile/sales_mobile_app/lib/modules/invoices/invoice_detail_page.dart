import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/error_view.dart';

final _invoiceDetailProvider = FutureProvider.autoDispose.family<SalesInvoiceDetail, String>((ref, invoiceId) async {
  return ref.watch(salesClientProvider).invoiceDetail(invoiceId);
});

class InvoiceDetailPage extends ConsumerWidget {
  const InvoiceDetailPage({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_invoiceDetailProvider(invoiceId));

    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => ErrorView(
          message: 'Could not load invoice.',
          onRetry: () => ref.refresh(_invoiceDetailProvider(invoiceId).future),
        ),
        data: (inv) => RefreshIndicator(
          onRefresh: () => ref.refresh(_invoiceDetailProvider(invoiceId).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(inv: inv),
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

  final SalesInvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(inv.invoiceDate);
    final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : inv.invoiceDate;
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
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isPaid ? Colors.green.shade100 : Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    isPaid ? 'PAID' : 'DUE',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isPaid ? Colors.green.shade800 : Colors.orange.shade800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _Row('Date', dateStr),
            _Row('Total', '₹${inv.total}'),
            _Row('Paid', '₹${inv.amountPaid}'),
            _Row('Due', '₹${inv.amountDue}'),
          ],
        ),
      ),
    );
  }
}

class _LinesCard extends StatelessWidget {
  const _LinesCard({required this.lines});

  final List<SalesInvoiceLine> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Line Items',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: lines
                .map(
                  (line) => ListTile(
                    dense: true,
                    title: Text(line.sku, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${line.qty} units × ₹${line.unitPrice}'),
                    trailing: Text('₹${line.lineTotal}', style: const TextStyle(fontWeight: FontWeight.w500)),
                  ),
                )
                .toList(),
          ),
        ),
      ],
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
        children: [
          SizedBox(
            width: 72,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
