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
  const InvoiceDetailPage({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outletId = ref.watch(outletIdProvider) ?? '';
    final args = (outletId: outletId, invoiceId: invoiceId);
    final async = ref.watch(_invoiceDetailProvider(args));

    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load invoice.',
          onRetry: () => ref.refresh(_invoiceDetailProvider(args).future),
        ),
        data: (inv) => RefreshIndicator(
          onRefresh: () => ref.refresh(_invoiceDetailProvider(args).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _HeaderCard(inv: inv),
              const SizedBox(height: 12),
              _LinesCard(lines: inv.lines),
              if (inv.charges.isNotEmpty) ...[
                const SizedBox(height: 12),
                _ChargesCard(inv: inv),
              ],
              const SizedBox(height: 12),
              _TotalsCard(inv: inv),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.inv});
  final InvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(inv.invoiceDate);
    final dateStr =
        date != null ? '${date.day}/${date.month}/${date.year}' : inv.invoiceDate;
    final due = inv.dueDate != null ? DateTime.tryParse(inv.dueDate!) : null;
    final dueStr = due != null ? '${due.day}/${due.month}/${due.year}' : null;
    final isPaid = (double.tryParse(inv.amountDue) ?? 1) == 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(inv.invoiceNumber,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                _Badge(
                  label: isPaid ? 'PAID' : 'DUE',
                  color: isPaid ? Colors.green : Colors.orange,
                ),
              ],
            ),
            const SizedBox(height: 10),
            _Row('Date', dateStr),
            _Row('Order', inv.orderNumber),
            if (dueStr != null) _Row('Due Date', dueStr),
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
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Text('Line Items',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
          ),
          const Divider(),
          ...lines.map((l) => _LineRow(line: l)),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});
  final InvoiceLineItem line;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.sku,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Text('${line.qty} × ₹${_fmt(line.unitPrice)}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          Text('₹${_fmt(line.lineTotal)}',
              style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _ChargesCard extends StatelessWidget {
  const _ChargesCard({required this.inv});
  final InvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Text('Taxes & Charges',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
          ),
          const Divider(),
          ...inv.charges.map((c) => Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        c.type == 'percentage'
                            ? '${c.name} (${_fmt(c.rate)}%)'
                            : c.name,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                    Text('₹${_fmt(c.amount)}',
                        style: const TextStyle(fontWeight: FontWeight.w500)),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.inv});
  final InvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    final hasDiscount =
        (double.tryParse(inv.discountAmount) ?? 0) > 0;
    final isDue = (double.tryParse(inv.amountDue) ?? 0) > 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _Row('Subtotal', '₹${_fmt(inv.subtotal)}'),
            if (hasDiscount)
              _Row(
                'Discount',
                '−₹${_fmt(inv.discountAmount)}',
                valueColor: Colors.green.shade700,
              ),
            _Row('Total', '₹${_fmt(inv.total)}',
                bold: true),
            const Divider(height: 16),
            _Row('Paid', '₹${_fmt(inv.amountPaid)}',
                valueColor: Colors.green.shade700),
            _Row(
              'Balance Due',
              '₹${_fmt(inv.amountDue)}',
              bold: true,
              valueColor: isDue ? Colors.red.shade700 : Colors.green.shade700,
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.bold, color: color)),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.bold = false, this.valueColor});
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: Colors.grey.shade600)),
          ),
          Text(
            value,
            style: TextStyle(
              fontWeight: bold ? FontWeight.bold : FontWeight.w500,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}

String _fmt(String value) {
  final d = double.tryParse(value) ?? 0;
  return d.toStringAsFixed(2).replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (m) => '${m[1]},',
      );
}
