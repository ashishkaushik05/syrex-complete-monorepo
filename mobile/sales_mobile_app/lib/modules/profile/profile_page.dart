import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/permissions/permission_service.dart';
import '../../shared/widgets/premium_surfaces.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user;
    final canField = ref.watch(canUseFieldProvider);
    final canAdminField = ref.watch(canAdminFieldProvider);

    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppPalette.ink,
      ),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: AppPalette.ocean.withOpacity(0.12),
                        child: Text(
                          user.email.isNotEmpty
                              ? user.email[0].toUpperCase()
                              : '?',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: AppPalette.ocean,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.email,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            StateBadge(
                              label: user.role.toUpperCase(),
                              color: AppPalette.ocean,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(height: 1),
                  const SizedBox(height: 14),
                  _ProfileRow(
                    icon: Icons.badge_outlined,
                    label: 'User ID',
                    value: user.id,
                    monospace: true,
                  ),
                  if (user.outletId != null) ...[
                    const SizedBox(height: 10),
                    _ProfileRow(
                      icon: Icons.storefront_outlined,
                      label: 'Outlet',
                      value: user.outletId!,
                    ),
                  ],
                  if (user.managedWarehouseId != null) ...[
                    const SizedBox(height: 10),
                    _ProfileRow(
                      icon: Icons.warehouse_outlined,
                      label: 'Warehouse',
                      value: user.managedWarehouseId!,
                    ),
                  ],
                ],
              ),
            ),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Access',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 12),
                  _AccessRow(
                    label: 'Field Sense',
                    active: user.isFieldEnabled,
                  ),
                  const SizedBox(height: 8),
                  _AccessRow(
                    label: 'Field Usage',
                    active: canField,
                  ),
                  const SizedBox(height: 8),
                  _AccessRow(
                    label: 'Field Admin',
                    active: canAdminField,
                  ),
                ],
              ),
            ),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Permissions',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 10),
                  if (user.permissions.contains('*'))
                    const _PermChip(label: '* (all permissions)')
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: user.permissions
                          .map((p) => _PermChip(label: p))
                          .toList(),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.label,
    required this.value,
    this.monospace = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool monospace;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppPalette.ocean),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                    fontSize: 12, color: Color(0xFF6A7B88)),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  fontFamily: monospace ? 'monospace' : null,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AccessRow extends StatelessWidget {
  const _AccessRow({required this.label, required this.active});

  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 14)),
        StateBadge(
          label: active ? 'ENABLED' : 'DISABLED',
          color: active ? AppPalette.mint : const Color(0xFF8A9BAA),
        ),
      ],
    );
  }
}

class _PermChip extends StatelessWidget {
  const _PermChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppPalette.ocean.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppPalette.ocean.withOpacity(0.18)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppPalette.ocean,
          fontFamily: 'monospace',
        ),
      ),
    );
  }
}
