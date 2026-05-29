import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/outlet/outlet_context.dart';

class MorePage extends ConsumerWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final outletId = ref.watch(outletIdProvider) ?? '—';
    final user = session.user;
    final initials = (user?.email.isNotEmpty ?? false)
        ? user!.email.substring(0, 1).toUpperCase()
        : 'O';

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    child: Text(
                      initials,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    user?.email ?? 'Outlet user',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Outlet ID: $outletId',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          _MenuTile(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Financials & payments',
            subtitle: 'View outstanding and AR aging',
            onTap: () => context.push('/accounts'),
          ),
          _MenuTile(
            icon: Icons.receipt_long_outlined,
            title: 'Invoices',
            subtitle: 'Open invoice history',
            onTap: () => context.go('/orders/list'),
          ),
          _MenuTile(
            icon: Icons.grid_view_rounded,
            title: 'Catalog',
            subtitle: 'Browse and add products',
            onTap: () => context.go('/catalog'),
          ),
          _MenuTile(
            icon: Icons.local_shipping_outlined,
            title: 'Track dispatches',
            subtitle: 'Check live delivery status',
            onTap: () => context.go('/track'),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
              side: BorderSide(color: Theme.of(context).colorScheme.error),
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: const Color(0xFFEEF2FF),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: const Color(0xFF6366F1), size: 20),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right, size: 20),
        onTap: onTap,
      ),
    );
  }
}
