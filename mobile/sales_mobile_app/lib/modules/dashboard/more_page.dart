import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../shared/widgets/premium_surfaces.dart';

class MorePage extends ConsumerWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user;

    return PremiumGradientBackground(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
        children: [
          const Text(
            'More',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppPalette.ink),
          ),
          const SizedBox(height: 6),
          Text(user?.email ?? '', style: const TextStyle(color: Color(0xFF5F6E7B))),
          const SizedBox(height: 14),
          PremiumCard(
            child: Column(
              children: [
                _ActionTile(
                  icon: Icons.menu_book_rounded,
                  label: 'Catalog',
                  subtitle: 'Browse products and pricing',
                  onTap: () => context.push('/catalog'),
                ),
                const Divider(height: 1),
                _ActionTile(
                  icon: Icons.person_outline,
                  label: 'Profile',
                  subtitle: 'Role, permissions and session',
                  onTap: () => context.push('/more/profile'),
                ),
                const Divider(height: 1),
                _ActionTile(
                  icon: Icons.settings_outlined,
                  label: 'App Settings',
                  subtitle: 'API info, environment and diagnostics',
                  onTap: () => context.push('/more/settings'),
                ),
              ],
            ),
          ),
          PremiumCard(
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppPalette.rose,
                minimumSize: const Size.fromHeight(46),
              ),
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Sign out'),
                    content: const Text('Are you sure you want to sign out?'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel')),
                      TextButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Sign out')),
                    ],
                  ),
                );
                if (confirmed == true) {
                  await ref.read(sessionControllerProvider.notifier).logout();
                }
              },
              icon: const Icon(Icons.logout),
              label: const Text('Logout'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppPalette.ocean),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
