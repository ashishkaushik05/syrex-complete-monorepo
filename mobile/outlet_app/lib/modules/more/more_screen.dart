import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/auth/session_controller.dart';
import '../../app/theme_provider.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final user = ref.watch(sessionControllerProvider).user;
    final name = user?.name ?? 'Outlet';
    final initials = name.length >= 2 ? name.substring(0, 2).toUpperCase() : name.toUpperCase();

    return Scaffold(
      backgroundColor: c.bg,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              color: c.bg,
              padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 16, 18, 20),
              child: Row(
                children: [
                  Container(
                    width: 52, height: 52,
                    decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(16)),
                    child: Center(
                      child: Text(initials,
                          style: AppTextStyles.label(color: Colors.white)
                              .copyWith(fontSize: 18, fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: AppTextStyles.screenTitle(color: c.text), overflow: TextOverflow.ellipsis),
                        Text(user?.email ?? '', style: AppTextStyles.smallLabel(color: c.textMute)),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => context.push('/more/profile'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(11),
                        border: Border.all(color: c.line),
                      ),
                      child: Text('View profile', style: AppTextStyles.labelBold(color: c.accent)),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _Section(title: 'Account', items: [
                  _Item(icon: Icons.person_outline, label: 'Profile', onTap: () => context.push('/more/profile'), c: c),
                ], c: c),
                const SizedBox(height: 16),
                _Section(title: 'Finance', items: [
                  _Item(icon: Icons.payments_outlined, label: 'Payments', onTap: () => context.push('/more/payments'), c: c),
                ], c: c),
                const SizedBox(height: 16),
                _Section(title: 'Support', items: [
                  _Item(icon: Icons.build_circle_outlined, label: 'Service complaints', onTap: () => context.push('/more/service'), c: c),
                ], c: c),
                const SizedBox(height: 16),
                _Section(title: 'Catalog', items: [
                  _Item(icon: Icons.category_outlined, label: 'Product catalog', onTap: () => context.push('/more/catalog'), c: c),
                ], c: c),
                const SizedBox(height: 24),
                _LogoutRow(c: c, ref: ref),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<_Item> items;
  final AppThemeColors c;
  const _Section({required this.title, required this.items, required this.c});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(title.toUpperCase(),
              style: AppTextStyles.caption(color: c.textFaint).copyWith(letterSpacing: 0.5, fontWeight: FontWeight.w700)),
        ),
        Container(
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: c.line),
            boxShadow: [c.shadow],
          ),
          child: Column(
            children: [
              for (int i = 0; i < items.length; i++) ...[
                if (i > 0) Divider(height: 1, color: c.line),
                items[i],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Item extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final AppThemeColors c;
  const _Item({required this.icon, required this.label, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 20, color: c.text),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: AppTextStyles.label(color: c.text))),
            Icon(Icons.chevron_right, size: 18, color: c.textFaint),
          ],
        ),
      ),
    );
  }
}

class _LogoutRow extends StatelessWidget {
  final AppThemeColors c;
  final WidgetRef ref;
  const _LogoutRow({required this.c, required this.ref});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => ref.read(sessionControllerProvider.notifier).logout(),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: c.redSoft,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: c.red.withOpacity(0.2)),
        ),
        child: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(10)),
              child: Icon(Icons.logout, size: 20, color: c.redText),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text('Log out', style: AppTextStyles.labelBold(color: c.redText))),
          ],
        ),
      ),
    );
  }
}
