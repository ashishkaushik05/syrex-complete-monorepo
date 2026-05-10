import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../core/auth/session_controller.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

class OutletSummaryRow {
  const OutletSummaryRow({
    required this.outlet,
    required this.openInvoices,
    required this.outstanding,
  });

  final SalesOutlet outlet;
  final int openInvoices;
  final double outstanding;
}

final _dashboardProvider = FutureProvider.autoDispose<List<OutletSummaryRow>>((ref) async {
  final client = ref.watch(salesClientProvider);
  final outlets = await client.outlets();
  final invoices = await client.invoices();

  final invoiceCountByOutlet = <String, int>{};
  final outstandingByOutlet = <String, double>{};
  for (final invoice in invoices) {
    final due = double.tryParse(invoice.amountDue) ?? 0;
    if (due <= 0) continue;
    invoiceCountByOutlet.update(invoice.outletId, (v) => v + 1, ifAbsent: () => 1);
    outstandingByOutlet.update(invoice.outletId, (v) => v + due, ifAbsent: () => due);
  }

  return outlets
      .map(
        (outlet) => OutletSummaryRow(
          outlet: outlet,
          openInvoices: invoiceCountByOutlet[outlet.id] ?? 0,
          outstanding: outstandingByOutlet[outlet.id] ?? 0,
        ),
      )
      .toList();
});

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final asyncRows = ref.watch(_dashboardProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sales Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(_dashboardProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Welcome, ${session.user?.email ?? ''}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            _NavTile(
              icon: Icons.receipt_long,
              label: 'My Orders',
              onTap: () => context.push('/orders/history'),
            ),
            _NavTile(
              icon: Icons.description,
              label: 'Invoices',
              onTap: () => context.push('/invoices/history'),
            ),
            _NavTile(
              icon: Icons.storefront,
              label: 'Browse Catalog',
              onTap: () => context.push('/catalog'),
            ),
            const SizedBox(height: 16),
            Text(
              'Outlets Outstanding',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            asyncRows.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => ErrorView(
                message: 'Could not load outlet summary.',
                onRetry: () => ref.refresh(_dashboardProvider.future),
              ),
              data: (rows) {
                if (rows.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: Text('No outlets found.')),
                  );
                }
                return Column(
                  children: rows
                      .map(
                        (row) => Card(
                          child: ListTile(
                            title: Text(row.outlet.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text('${row.outlet.outletCode} • ${row.outlet.ownerName}'),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('₹${row.outstanding.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                const SizedBox(height: 2),
                                Text('${row.openInvoices} open invoices', style: Theme.of(context).textTheme.bodySmall),
                              ],
                            ),
                            onTap: () {
                              ref.read(selectedOutletIdProvider.notifier).state = row.outlet.id;
                              context.push('/orders/create');
                            },
                          ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/orders/create'),
        icon: const Icon(Icons.add_shopping_cart),
        label: const Text('New Order'),
      ),
    );
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
