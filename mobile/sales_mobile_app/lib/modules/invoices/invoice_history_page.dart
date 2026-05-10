import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

final _invoicesProvider = FutureProvider.autoDispose.family<List<SalesInvoice>, ({String? outletId, String? q})>((ref, args) {
  return ref.watch(salesClientProvider).invoices(outletId: args.outletId, q: args.q);
});

class InvoiceHistoryPage extends ConsumerStatefulWidget {
  const InvoiceHistoryPage({super.key});

  @override
  ConsumerState<InvoiceHistoryPage> createState() => _InvoiceHistoryPageState();
}

class _InvoiceHistoryPageState extends ConsumerState<InvoiceHistoryPage> {
  final _searchCtrl = TextEditingController();
  String? _q;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selectedOutletId = ref.watch(selectedOutletIdProvider);
    final invoices = ref.watch(_invoicesProvider((outletId: selectedOutletId, q: _q)));

    return Scaffold(
      appBar: AppBar(title: const Text('Invoices')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search by invoice or order number…',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _q = null);
                        },
                      )
                    : null,
              ),
              onChanged: (v) => setState(() => _q = v.isEmpty ? null : v),
            ),
          ),
          Expanded(
            child: invoices.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => ErrorView(
                message: 'Could not load invoices.',
                onRetry: () => ref.refresh(_invoicesProvider((outletId: selectedOutletId, q: _q)).future),
              ),
              data: (items) {
                if (items.isEmpty) return const Center(child: Text('No invoices found.'));
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(_invoicesProvider((outletId: selectedOutletId, q: _q)).future),
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _InvoiceCard(invoice: items[i]),
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

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final SalesInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(invoice.invoiceDate);
    final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : invoice.invoiceDate;
    final isDue = (double.tryParse(invoice.amountDue) ?? 0) > 0;

    return Card(
      child: ListTile(
        title: Text(invoice.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(dateStr),
        trailing: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('₹${invoice.total}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            if (isDue)
              Text('Due: ₹${invoice.amountDue}', style: TextStyle(color: Colors.red[700], fontSize: 12, fontWeight: FontWeight.w500))
            else
              Text('Paid', style: TextStyle(color: Colors.green[700], fontSize: 12, fontWeight: FontWeight.w500)),
          ],
        ),
        onTap: () => context.push('/invoices/${invoice.id}'),
      ),
    );
  }
}
