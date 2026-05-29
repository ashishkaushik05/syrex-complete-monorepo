import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/outlet/outlet_context.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final outletId = ref.watch(outletIdProvider);
    final user = session.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Avatar + name
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  child: Icon(
                    Icons.person,
                    size: 36,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  user?.email ?? '—',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  user?.role ?? '—',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.grey.shade600),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Info card
          Card(
            child: Column(
              children: [
                _InfoTile(
                  icon: Icons.store_outlined,
                  label: 'Outlet ID',
                  value: outletId ?? '—',
                ),
                const Divider(),
                _InfoTile(
                  icon: Icons.verified_user_outlined,
                  label: 'Permissions',
                  value: '${user?.permissions.length ?? 0} granted',
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Logout
          OutlinedButton.icon(
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Sign Out'),
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

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
      title: Text(label,
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: Colors.grey.shade600)),
      subtitle: Text(value,
          style: const TextStyle(fontWeight: FontWeight.w500)),
    );
  }
}
