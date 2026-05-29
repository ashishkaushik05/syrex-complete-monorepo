import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/permissions/permission_service.dart';
import '../../modules/orders/cart_provider.dart';
import '../../shared/widgets/rb_components.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartCount = ref.watch(cartProvider).items.length;
    final canUseField = ref.watch(canUseFieldProvider);

    return Scaffold(
      body: navigationShell,
      extendBody: true,
      bottomNavigationBar: _RbTabBar(
        currentIndex: navigationShell.currentIndex,
        onTap: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        cartCount: cartCount,
        isFieldEnabled: canUseField,
      ),
    );
  }
}

class _RbTabBar extends StatelessWidget {
  const _RbTabBar({
    required this.currentIndex,
    required this.onTap,
    required this.cartCount,
    required this.isFieldEnabled,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final int cartCount;
  final bool isFieldEnabled;

  static const _tabs = [
    _TabItem(
        index: 0,
        label: 'Home',
        icon: Icons.home_outlined,
        activeIcon: Icons.home),
    _TabItem(
        index: 1,
        label: 'Catalog',
        icon: Icons.grid_view_outlined,
        activeIcon: Icons.grid_view),
    _TabItem(
        index: 2,
        label: 'Orders',
        icon: Icons.inventory_2_outlined,
        activeIcon: Icons.inventory_2),
    _TabItem(
        index: 3,
        label: 'Field',
        icon: Icons.location_on_outlined,
        activeIcon: Icons.location_on),
    _TabItem(
        index: 4,
        label: 'Profile',
        icon: Icons.person_outline,
        activeIcon: Icons.person),
  ];

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final tabs =
        isFieldEnabled ? _tabs : _tabs.where((t) => t.index != 3).toList();

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          decoration: BoxDecoration(
            color: c.surface.withOpacity(0.88),
            border: Border(top: BorderSide(color: c.line, width: 0.5)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
              child: Row(
                children: tabs.map((tab) {
                  final routerIndex = tab.index;
                  final isActive = currentIndex == routerIndex;

                  return Expanded(
                    child: GestureDetector(
                      onTap: () => onTap(routerIndex),
                      behavior: HitTestBehavior.opaque,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(8),
                            child: Stack(
                              clipBehavior: Clip.none,
                              alignment: Alignment.center,
                              children: [
                                Icon(
                                  isActive ? tab.activeIcon : tab.icon,
                                  size: 22,
                                  color: isActive ? c.ink : c.muted,
                                ),
                                if (tab.index == 2 && cartCount > 0)
                                  Positioned(
                                    top: -4,
                                    right: -8,
                                    child: Container(
                                      constraints:
                                          const BoxConstraints(minWidth: 16),
                                      height: 16,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 4),
                                      decoration: BoxDecoration(
                                        color: RbColors.accent,
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        '$cartCount',
                                        style: const TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          Text(
                            tab.label,
                            style: GoogleFonts.inter(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.01,
                              color: isActive ? c.ink : c.muted,
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TabItem {
  const _TabItem({
    required this.index,
    required this.label,
    required this.icon,
    required this.activeIcon,
  });

  final int index;
  final String label;
  final IconData icon;
  final IconData activeIcon;
}
