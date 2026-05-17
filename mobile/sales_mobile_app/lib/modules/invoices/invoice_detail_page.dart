import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/premium_surfaces.dart';

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
      appBar: AppBar(title: const Text('Invoice Detail')),
      body: PremiumGradientBackground(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => const EmptyStateView(
            title: 'Invoice unavailable',
            subtitle: 'Retry from the finance list.',
            icon: Icons.receipt_long_outlined,
          ),
          data: (inv) => RefreshIndicator(
            onRefresh: () => ref.refresh(_invoiceDetailProvider(invoiceId).future),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
              children: [
                PremiumCard(child: _Header(inv: inv)),
                PremiumCard(child: _LinesCard(lines: inv.lines)),
              ],
            ),
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
    final isPaid = (double.tryParse(inv.amountDue) ?? 0) <= 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(inv.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            StateBadge(label: isPaid ? 'PAID' : 'DUE', color: isPaid ? AppPalette.mint : AppPalette.rose),
          ],
        ),
        const SizedBox(height: 8),
        _Row('Date', dateStr),
        _Row('Total', '₹${inv.total}'),
        _Row('Paid', '₹${inv.amountPaid}'),
        _Row('Due', '₹${inv.amountDue}'),
      ],
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
        const Text('Line Items', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
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
                      Text('${line.qty} × ₹${line.unitPrice}'),
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
          SizedBox(width: 80, child: Text(label, style: const TextStyle(color: Color(0xFF677684)))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
