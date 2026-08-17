import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

enum OutletTab { home, orders, dispatches, invoices, more }

class OutletTabBar extends StatelessWidget {
  final OutletTab active;
  final ValueChanged<OutletTab> onTap;
  final AppThemeColors c;
  final Map<OutletTab, int>? badges;

  const OutletTabBar({
    super.key,
    required this.active,
    required this.onTap,
    required this.c,
    this.badges,
  });

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.line)),
        boxShadow: c.dark ? [] : [
          BoxShadow(
            color: const Color(0xFF211F1A).withOpacity(0.25),
            blurRadius: 22,
            offset: const Offset(0, -6),
            spreadRadius: -16,
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(6, 8, 6, bottomPad > 0 ? bottomPad : 16),
      child: Row(
        children: OutletTab.values.map((tab) => _TabItem(
          tab: tab,
          active: tab == active,
          onTap: () => onTap(tab),
          c: c,
          badge: badges?[tab],
        )).toList(),
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  final OutletTab tab;
  final bool active;
  final VoidCallback onTap;
  final AppThemeColors c;
  final int? badge;

  const _TabItem({
    required this.tab,
    required this.active,
    required this.onTap,
    required this.c,
    this.badge,
  });

  IconData get _icon {
    switch (tab) {
      case OutletTab.home:
        return Icons.home_outlined;
      case OutletTab.orders:
        return Icons.assignment_outlined;
      case OutletTab.dispatches:
        return Icons.local_shipping_outlined;
      case OutletTab.invoices:
        return Icons.receipt_long_outlined;
      case OutletTab.more:
        return Icons.more_horiz;
    }
  }

  String get _label {
    switch (tab) {
      case OutletTab.home:
        return 'Home';
      case OutletTab.orders:
        return 'Orders';
      case OutletTab.dispatches:
        return 'Dispatch';
      case OutletTab.invoices:
        return 'Invoices';
      case OutletTab.more:
        return 'More';
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = active ? c.accent : c.textMute;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(_icon, size: 24, color: color),
                if (badge != null && badge! > 0)
                  Positioned(
                    top: -3, right: -6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      decoration: BoxDecoration(
                        color: c.red,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: c.surface, width: 2),
                      ),
                      child: Text(
                        '$badge',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              _label,
              style: active
                  ? AppTextStyles.tabLabelActive(color: c.accent)
                  : AppTextStyles.tabLabel(color: c.textMute),
            ),
          ],
        ),
      ),
    );
  }
}
