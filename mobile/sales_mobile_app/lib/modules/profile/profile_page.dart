import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/auth/session_controller.dart';
import '../../shared/widgets/rb_components.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final user = session.user;
    final c = rbColors(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (user == null) {
      return Scaffold(
        backgroundColor: c.bg,
        body: const Center(
            child: CircularProgressIndicator(
                strokeWidth: 2, color: RbColors.accent)),
      );
    }

    final initials = _initials(user.email);

    return Scaffold(
      backgroundColor: c.bg,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: RbTopBar(title: 'Profile')),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                const SizedBox(height: 8),

                // Profile card
                RbCard(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        RbAvatar(initials: initials, size: 72),
                        const SizedBox(height: 12),
                        Text(
                          user.email.split('@').first,
                          style: GoogleFonts.inter(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: c.ink,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(user.email,
                            style: GoogleFonts.inter(
                                fontSize: 13, color: c.muted)),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          alignment: WrapAlignment.center,
                          children: [
                            RbChip(label: user.role, tone: RbTone.info),
                            if (user.isFieldEnabled)
                              RbChip(
                                  label: 'Field-enabled',
                                  tone: RbTone.success),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Account section
                RbSection(label: 'Account'),
                const SizedBox(height: 8),
                RbCard(
                  child: Column(
                    children: [
                      _InfoRow(
                          icon: Icons.business_outlined,
                          label: 'Role',
                          value: user.role,
                          isFirst: true),
                      if (user.outletId != null)
                        _InfoRow(
                            icon: Icons.store_outlined,
                            label: 'Outlet',
                            value: user.outletId!),
                      _InfoRow(
                          icon: Icons.email_outlined,
                          label: 'Email',
                          value: user.email),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Preferences section
                RbSection(label: 'Preferences'),
                const SizedBox(height: 8),
                RbCard(
                  child: Column(
                    children: [
                      _RowItem(
                        icon: Icons.dark_mode_outlined,
                        label: 'Theme',
                        trailing: Text(isDark ? 'Dark' : 'Light',
                            style: GoogleFonts.inter(
                                fontSize: 13, color: c.muted)),
                        isFirst: true,
                        onTap: () {},
                      ),
                      _RowItem(
                        icon: Icons.notifications_outlined,
                        label: 'Notifications',
                        trailing: Icon(Icons.chevron_right, size: 16, color: c.muted),
                        onTap: () {},
                      ),
                      if (user.isFieldEnabled)
                        _RowItem(
                          icon: Icons.location_on_outlined,
                          label: 'Field Sense',
                          trailing: Icon(Icons.chevron_right,
                              size: 16, color: c.muted),
                          onTap: () {},
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Permissions
                if (user.permissions.isNotEmpty) ...[
                  RbSection(label: 'Permissions'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: user.permissions
                            .map((p) => _PermChip(perm: p))
                            .toList(),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // App section
                RbSection(label: 'App'),
                const SizedBox(height: 8),
                RbCard(
                  child: Column(
                    children: [
                      _RowItem(
                        icon: Icons.sync_outlined,
                        label: 'Background sync',
                        trailing: Icon(Icons.chevron_right,
                            size: 16, color: c.muted),
                        isFirst: true,
                        onTap: () {},
                      ),
                      _RowItem(
                        icon: Icons.help_outline,
                        label: 'Help & support',
                        trailing: Icon(Icons.chevron_right,
                            size: 16, color: c.muted),
                        onTap: () {},
                      ),
                      _RowItem(
                        icon: Icons.info_outline,
                        label: 'About',
                        trailing: Text('v4.18.2',
                            style: GoogleFonts.jetBrainsMono(
                                fontSize: 12, color: c.muted)),
                        onTap: () {},
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Sign out
                RbBtn(
                  label: 'Sign out',
                  variant: RbBtnVariant.outline,
                  size: RbBtnSize.lg,
                  onPressed: () =>
                      ref.read(sessionControllerProvider.notifier).logout(),
                ),
                const SizedBox(height: 8),
                Center(
                  child: Text(
                    'v4.18.2 · build 22a · API IN-PROD',
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 11, color: c.muted2),
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  static String _initials(String email) {
    final name = email.split('@').first;
    final parts = name.split(RegExp(r'[._-]'));
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(
      {required this.icon,
      required this.label,
      required this.value,
      this.isFirst = false});
  final IconData icon;
  final String label;
  final String value;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          Icon(icon, size: 16, color: c.muted),
          const SizedBox(width: 12),
          SizedBox(
            width: 70,
            child: Text(label,
                style: GoogleFonts.inter(fontSize: 13, color: c.muted)),
          ),
          Expanded(
            child: Text(value,
                style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: c.ink)),
          ),
        ],
      ),
    );
  }
}

class _RowItem extends StatelessWidget {
  const _RowItem({
    required this.icon,
    required this.label,
    required this.trailing,
    this.isFirst = false,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Widget trailing;
  final bool isFirst;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      onTap: onTap,
      child: Row(
        children: [
          Icon(icon, size: 16, color: c.muted),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label,
                style: GoogleFonts.inter(fontSize: 14, color: c.ink)),
          ),
          trailing,
        ],
      ),
    );
  }
}

class _PermChip extends StatelessWidget {
  const _PermChip({required this.perm});
  final String perm;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: rbColors(context).surface2,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: rbColors(context).line, width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check, size: 10, color: RbColors.accent),
          const SizedBox(width: 4),
          Text(perm,
              style: GoogleFonts.jetBrainsMono(
                  fontSize: 11, color: rbColors(context).ink2)),
        ],
      ),
    );
  }
}
