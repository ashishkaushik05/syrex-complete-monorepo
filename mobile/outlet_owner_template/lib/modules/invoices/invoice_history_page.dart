import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

final _invoicesProvider = FutureProvider.autoDispose
    .family<PagedResult<InvoiceListItem>, ({String outletId, String? q})>(
        (ref, args) {
  return ref
      .watch(outletPortalClientProvider)
      .invoiceHistory(args.outletId, q: args.q);
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
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Invoices')),
        body: const ErrorView(message: 'No outlet linked to this account.'),
      );
    }

    final invoices = ref.watch(_invoicesProvider((outletId: outletId, q: _q)));

    return Scaffold(
      appBar: AppBar(title: const Text('Invoice History')),
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
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8)),
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
              onChanged: (v) =>
                  setState(() => _q = v.isEmpty ? null : v),
            ),
          ),
          Expanded(
            child: invoices.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorView(
                message: 'Could not load invoices.',
                onRetry: () => ref.refresh(
                    _invoicesProvider((outletId: outletId, q: _q)).future),
              ),
              data: (result) => result.items.isEmpty
                  ? const Center(child: Text('No invoices found.'))
                  : RefreshIndicator(
                      onRefresh: () => ref.refresh(
                          _invoicesProvider((outletId: outletId, q: _q))
                              .future),
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        itemCount: result.items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 8),
                        itemBuilder: (_, i) =>
                            _InvoiceCard(invoice: result.items[i]),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final InvoiceListItem invoice;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(invoice.invoiceDate);
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : invoice.invoiceDate;

    final isDue = (double.tryParse(invoice.amountDue) ?? 0) > 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(invoice.invoiceNumber,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(dateStr,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('₹${invoice.total}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                if (isDue)
                  Text('Due: ₹${invoice.amountDue}',
                      style: TextStyle(
                          color: Colors.red[700],
                          fontSize: 12,
                          fontWeight: FontWeight.w500))
                else
                  Text('Paid',
                      style: TextStyle(
                          color: Colors.green[700],
                          fontSize: 12,
                          fontWeight: FontWeight.w500)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
