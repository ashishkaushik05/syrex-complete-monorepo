import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/auth/session_controller.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_typography.dart';
import 'package:outlet_owner_template/core/widgets/rb_avatar.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_section.dart';

/// Profile screen for the Routebook app.
/// Displays user info, account details, preferences, app info, and granted permissions.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final user = session.user;
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // Extract initials from email
    final initials = user.email.split('@')[0].substring(0, 2).toUpperCase();

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
        children: [
          const SizedBox(height: 16),

          // ── Profile hero card ──
          Center(
            child: Column(
              children: [
                RbAvatar(initials: initials, size: 72, backgroundColor: cs.ink),
                const SizedBox(height: 12),
                Text(
                  user.email,
                  style: AppTextStyles.h2(cs.ink),
                ),
                const SizedBox(height: 4),
                Text(
                  user.role,
                  style: TextStyle(fontSize: 14, color: cs.ink2),
                ),
                const SizedBox(height: 12),

                // Role chip + Field-enabled chip
                Wrap(
                  spacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    RbChip(
                      label: user.role,
                      variant: RbChipVariant.neutral,
                    ),
                    if (user.isFieldEnabled)
                      RbChip(
                        label: 'Field-enabled',
                        variant: RbChipVariant.accent,
                        leading: RbIcon('check', size: 10, color: cs.accent),
                      ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),

          // ── Account section ──
          RbSection(
            label: 'Account',
            child: _InfoCard(
              rows: [
                _InfoRow(label: 'Organization', value: user.orgId ?? '—'),
                _InfoRow(label: 'Assigned outlet', value: user.outletId ?? '—'),
                _InfoRow(label: 'Role', value: user.role),
              ],
            ),
          ),

          // ── Preferences section ──
          RbSection(
            label: 'Preferences',
            child: _InfoCard(
              rows: [
                _InfoRow(
                  label: 'Permissions',
                  value: '${user.permissions.length} granted',
                ),
                _InfoRow(
                  label: 'Field Sense',
                  value: user.isFieldEnabled ? 'Enabled' : 'Disabled',
                ),
                const _InfoRow(label: 'Notifications', value: 'Enabled'),
              ],
            ),
          ),

          // ── App section ──
          const RbSection(
            label: 'App',
            child: _InfoCard(
              rows: [
                _InfoRow(label: 'Background sync', value: 'Enabled'),
                _InfoRow(label: 'Help & support', value: 'Open in browser'),
                _InfoRow(label: 'About Routebook', value: 'v4.18.2'),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // ── Granted permissions section ──
          RbSection(
            label: 'Granted permissions',
            padded: true,
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: user.permissions
                  .map(
                    (p) => RbChip(
                      label: p,
                      mono: true,
                      leading: RbIcon('check', size: 10, color: cs.accent),
                    ),
                  )
                  .toList(),
            ),
          ),

          const SizedBox(height: 32),

          // ── Sign out button ──
          RbButton(
            label: 'Sign out',
            variant: RbButtonVariant.danger,
            size: RbButtonSize.lg,
            fullWidth: true,
            onPressed: () {
              ref.read(sessionControllerProvider.notifier).logout();
            },
          ),

          const SizedBox(height: 16),

          // ── Footer ──
          Center(
            child: Text(
              'v4.18.2 • build 2026.05.25',
              style: TextStyle(fontSize: 12, color: cs.ink2),
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

/// Simple info card with rows
class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.rows});

  final List<_InfoRow> rows;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radius),
        border: Border.all(color: cs.line),
      ),
      child: Column(
        children: [
          for (int i = 0; i < rows.length; i++) ...[
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 12,
              ),
              child: rows[i],
            ),
            if (i < rows.length - 1)
              Divider(height: 1, color: cs.line, indent: 0, endIndent: 0),
          ]
        ],
      ),
    );
  }
}

/// Single info row (label: value)
class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 14, color: cs.ink2),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            color: cs.ink,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

