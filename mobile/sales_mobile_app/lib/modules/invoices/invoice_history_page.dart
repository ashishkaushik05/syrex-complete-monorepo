import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/premium_surfaces.dart';

final _invoicesProvider = FutureProvider.autoDispose.family<List<SalesInvoice>, ({String? q})>((ref, args) {
  return ref.watch(salesClientProvider).invoices(q: args.q);
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
    final invoices = ref.watch(_invoicesProvider((q: _q)));

    return PremiumGradientBackground(
      child: RefreshIndicator(
        onRefresh: () => ref.refresh(_invoicesProvider((q: _q)).future),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            const Text('Finance', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppPalette.ink)),
            const SizedBox(height: 4),
            const Text('Invoices and payment-relevant read views', style: TextStyle(color: Color(0xFF5F6E7C))),
            const SizedBox(height: 12),
            TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search invoice/order number',
                prefixIcon: const Icon(Icons.search),
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
            const SizedBox(height: 12),
            invoices.when(
              loading: () => const PremiumCard(child: LinearProgressIndicator()),
              error: (_, __) => const PremiumCard(
                child: EmptyStateView(
                  title: 'Could not load invoices',
                  subtitle: 'Pull to refresh when network is stable.',
                  icon: Icons.receipt_long_outlined,
                ),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return const PremiumCard(
                    child: EmptyStateView(
                      title: 'No invoices found',
                      subtitle: 'No finance records match your current search.',
                      icon: Icons.search_off_outlined,
                    ),
                  );
                }
                return Column(
                  children: items
                      .map(
                        (invoice) => _InvoiceCard(invoice: invoice),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ),
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
    final due = double.tryParse(invoice.amountDue) ?? 0;

    return PremiumCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(invoice.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(dateStr),
        trailing: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('₹${invoice.total}', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            StateBadge(
              label: due <= 0 ? 'PAID' : 'DUE ₹${invoice.amountDue}',
              color: due <= 0 ? AppPalette.mint : AppPalette.rose,
            ),
          ],
        ),
        onTap: () => context.push('/finance/invoices/${invoice.id}'),
      ),
    );
  }
}
