import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/auth/session_controller.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

final _summaryProvider = FutureProvider.autoDispose
    .family<OutletSummary, String>((ref, outletId) async {
  return ref.watch(outletPortalClientProvider).summary(outletId);
});

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outletId = ref.watch(outletIdProvider);
    final session = ref.watch(sessionControllerProvider);

    if (outletId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Dashboard')),
        body: const ErrorView(message: 'No outlet linked to this account.'),
      );
    }

    final summary = ref.watch(_summaryProvider(outletId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(_summaryProvider(outletId).future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Welcome, ${session.user?.email ?? ''}',
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            summary.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorView(
                message: 'Could not load summary.',
                onRetry: () => ref.refresh(_summaryProvider(outletId).future),
              ),
              data: (s) => _SummaryCards(summary: s),
            ),
            const SizedBox(height: 24),
            _NavTile(
              icon: Icons.receipt_long,
              label: 'Order History',
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
            // Field Sense tile — only shown when user has isFieldEnabled
            if (session.user?.isFieldEnabled == true)
              _NavTile(
                icon: Icons.location_on,
                label: 'Field Sense',
                onTap: () => context.push('/field'),
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

class _SummaryCards extends StatelessWidget {
  const _SummaryCards({required this.summary});

  final OutletSummary summary;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _InfoCard(
          title: 'Outstanding Balance',
          value: '₹${summary.outstandingLive}',
          subtitle: 'Snapshot: ₹${summary.outstandingSnapshot}',
          color: Theme.of(context).colorScheme.errorContainer,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _InfoCard(
                title: 'Open Orders',
                value: '${summary.ordersCount}',
                color: Theme.of(context).colorScheme.primaryContainer,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _InfoCard(
                title: 'Unpaid Invoices',
                value: '${summary.openInvoicesCount}',
                color: Theme.of(context).colorScheme.secondaryContainer,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.title,
    required this.value,
    this.subtitle,
    required this.color,
  });

  final String title;
  final String value;
  final String? subtitle;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: Theme.of(context)
                    .textTheme
                    .labelMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(value,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    )),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile(
      {required this.icon, required this.label, required this.onTap});

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
