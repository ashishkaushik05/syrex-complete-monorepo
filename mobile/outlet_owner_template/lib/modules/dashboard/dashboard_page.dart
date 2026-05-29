import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/auth/session_controller.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/status_chip.dart';

final _summaryProvider =
    FutureProvider.autoDispose.family<OutletSummary, String>((ref, outletId) {
  return ref.watch(outletPortalClientProvider).summary(outletId);
});

final _recentOrdersProvider = FutureProvider.autoDispose
    .family<PagedResult<OrderSummary>, String>((ref, outletId) {
  return ref.watch(outletPortalClientProvider).orderHistory(outletId, limit: 3);
});

final _recentDispatchesProvider = FutureProvider.autoDispose
    .family<PagedResult<LinkedDispatch>, String>((ref, outletId) {
  return ref
      .watch(outletPortalClientProvider)
      .dispatchHistory(outletId, limit: 8);
});

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final outletId = ref.watch(outletIdProvider);
    final session = ref.watch(sessionControllerProvider);

    if (outletId == null) {
      return const Scaffold(
        body: EmptyState(
          icon: Icons.store_outlined,
          message:
              'No outlet linked to this account.\nContact your administrator.',
        ),
      );
    }

    final summary = ref.watch(_summaryProvider(outletId));
    final recentOrders = ref.watch(_recentOrdersProvider(outletId));
    final recentDispatches = ref.watch(_recentDispatchesProvider(outletId));
    final username = session.user?.email.split('@').first ?? 'Outlet';

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_summaryProvider(outletId));
          ref.invalidate(_recentOrdersProvider(outletId));
          ref.invalidate(_recentDispatchesProvider(outletId));
          await Future.wait([
            ref.read(_summaryProvider(outletId).future),
            ref.read(_recentOrdersProvider(outletId).future),
            ref.read(_recentDispatchesProvider(outletId).future),
          ]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    username.isEmpty ? 'O' : username[0].toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome back',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: Colors.grey.shade600),
                      ),
                      Text(
                        username,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => context.go('/account'),
                  icon: const Icon(Icons.person_outline),
                ),
              ],
            ),
            const SizedBox(height: 12),
            summary.when(
              loading: () => const _SkeletonBanner(),
              error: (_, __) => ErrorView(
                message: 'Could not load summary.',
                onRetry: () => ref.refresh(_summaryProvider(outletId).future),
              ),
              data: (s) => _SummaryHero(summary: s),
            ),
            const SizedBox(height: 16),
            const _SectionTitle('Quick actions'),
            const SizedBox(height: 8),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 4,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 0.95,
              children: [
                _ActionCard(
                  icon: Icons.add,
                  label: 'New order',
                  onTap: () => context.push('/orders/new'),
                ),
                _ActionCard(
                  icon: Icons.grid_view_rounded,
                  label: 'Catalog',
                  onTap: () => context.go('/catalog'),
                ),
                _ActionCard(
                  icon: Icons.local_shipping_outlined,
                  label: 'Track',
                  onTap: () => context.go('/track'),
                ),
                _ActionCard(
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Pay',
                  onTap: () => context.push('/accounts'),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _StatsRow(summary: summary),
            const SizedBox(height: 14),
            _ArrivingSoonSection(dispatches: recentDispatches),
            const SizedBox(height: 14),
            _RecentOrdersSection(orders: recentOrders),
          ],
        ),
      ),
    );
  }
}

class _SummaryHero extends StatelessWidget {
  const _SummaryHero({required this.summary});

  final OutletSummary summary;

  @override
  Widget build(BuildContext context) {
    final outstanding = double.tryParse(summary.outstandingLive) ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF09090B),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Outstanding balance',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 6),
          Text(
            '₹${_fmtMoney(summary.outstandingLive)}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 34,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.6,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              _HeroMeta(
                '${summary.openInvoicesCount}',
                'open invoices',
                Colors.white,
              ),
              _HeroMeta(
                outstanding > 0 ? 'Pending' : 'Clear',
                'payment status',
                outstanding > 0
                    ? const Color(0xFFF59E0B)
                    : const Color(0xFF10B981),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => context.push('/accounts'),
                  icon: const Icon(Icons.receipt_long_outlined, size: 16),
                  label: const Text('Invoices'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white24),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => context.push('/accounts'),
                  icon: const Icon(Icons.account_balance_wallet_outlined,
                      size: 16),
                  label: const Text('Pay now'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.summary});

  final AsyncValue<OutletSummary> summary;

  @override
  Widget build(BuildContext context) {
    return summary.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (s) => Row(
        children: [
          Expanded(
            child: _StatCard(
              title: 'Total orders',
              value: '${s.ordersCount}',
              subtitle: 'Created so far',
              onTap: () => context.go('/orders/list'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatCard(
              title: 'Open invoices',
              value: '${s.openInvoicesCount}',
              subtitle: 'Needs payment',
              onTap: () => context.push('/accounts'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ArrivingSoonSection extends StatelessWidget {
  const _ArrivingSoonSection({required this.dispatches});

  final AsyncValue<PagedResult<LinkedDispatch>> dispatches;

  @override
  Widget build(BuildContext context) {
    return dispatches.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (result) {
        final live = result.items
            .where((d) =>
                d.deliveryStatus == 'in_transit' ||
                d.deliveryStatus == 'created')
            .take(2)
            .toList();
        if (live.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(
              'Arriving soon',
              action: 'Track all',
              onAction: () => context.go('/track'),
            ),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  for (var i = 0; i < live.length; i++) ...[
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 4),
                      leading: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF2FF),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.local_shipping_outlined,
                          color: Color(0xFF6366F1),
                          size: 18,
                        ),
                      ),
                      title: Text(
                        live[i].id.substring(0, 8).toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        '${live[i].transporterName} · ETA ${_dateShort(live[i].estimatedDelivery)}',
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                      trailing: StatusChip(status: live[i].deliveryStatus),
                      onTap: () => context.push('/dispatches/${live[i].id}'),
                    ),
                    if (i != live.length - 1) const Divider(height: 1),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _RecentOrdersSection extends StatelessWidget {
  const _RecentOrdersSection({required this.orders});

  final AsyncValue<PagedResult<OrderSummary>> orders;

  @override
  Widget build(BuildContext context) {
    return orders.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (result) {
        if (result.items.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(
              'Recent orders',
              action: 'See all',
              onAction: () => context.go('/orders/list'),
            ),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  for (var i = 0; i < result.items.length; i++) ...[
                    ListTile(
                      title: Text(
                        result.items[i].orderNumber,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(_dateShort(result.items[i].orderDate)),
                      trailing: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          StatusChip(status: result.items[i].status),
                          const SizedBox(height: 4),
                          Text(
                            '₹${_fmtMoney(result.items[i].totalValue)}',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      onTap: () =>
                          context.push('/orders/${result.items[i].id}'),
                    ),
                    if (i != result.items.length - 1) const Divider(height: 1),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade300),
          color: Theme.of(context).cardColor,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 20),
              const SizedBox(height: 5),
              Text(
                label,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.title,
    required this.value,
    required this.subtitle,
    required this.onTap,
  });

  final String title;
  final String value;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Ink(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroMeta extends StatelessWidget {
  const _HeroMeta(this.value, this.label, this.color);

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(color: Colors.white70, fontSize: 12),
        children: [
          TextSpan(
            text: value,
            style: TextStyle(color: color, fontWeight: FontWeight.w700),
          ),
          TextSpan(text: ' $label'),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, {this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const Spacer(),
        if (action != null)
          TextButton(
            onPressed: onAction,
            child: Text(action!),
          ),
      ],
    );
  }
}

class _SkeletonBanner extends StatelessWidget {
  const _SkeletonBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 170,
      decoration: BoxDecoration(
        color: Colors.grey.shade300,
        borderRadius: BorderRadius.circular(16),
      ),
    );
  }
}

String _fmtMoney(String value) {
  final d = double.tryParse(value) ?? 0;
  return d.toStringAsFixed(2).replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (m) => '${m[1]},',
      );
}

String _dateShort(String? iso) {
  if (iso == null) return 'TBD';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day}/${d.month}/${d.year}';
}
