import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:outlet_owner_template/core/widgets/rb_tab_bar.dart';
import 'package:outlet_owner_template/core/widgets/rb_toast.dart';

/// Provides and manages toast messages app-wide.
final toastProvider = StateProvider<String?>((ref) => null);

/// Main scaffold for the authenticated app shell.
/// Wraps the navigated content with a bottom tab bar.
/// The actual navigation is handled by GoRouter's StatefulShellRoute.
class AppShell extends ConsumerWidget {
  const AppShell({
    super.key,
    required this.navigationShell,
    required this.fieldEnabled,
    required this.cartCount,
  });

  final StatefulNavigationShell navigationShell;
  final bool fieldEnabled;
  final int cartCount;

  static final List<RbTabItem> _baseTabs = [
    const RbTabItem(id: 'home', label: 'Home', icon: 'home'),
    const RbTabItem(id: 'catalog', label: 'Catalog', icon: 'grid'),
    const RbTabItem(id: 'orders', label: 'Orders', icon: 'box'),
  ];

  List<RbTabItem> _tabs() => [
        ..._baseTabs,
        if (fieldEnabled) const RbTabItem(id: 'field', label: 'Field', icon: 'pin'),
        const RbTabItem(id: 'profile', label: 'Profile', icon: 'user'),
      ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final toast = ref.watch(toastProvider);
    final tabIndex = navigationShell.currentIndex;
    final tabs = _tabs();

    // Update orders tab badge
    final tabsWithBadge = tabs.map((t) {
      if (t.id == 'orders' && cartCount > 0) {
        return RbTabItem(id: t.id, label: t.label, icon: t.icon, badge: cartCount);
      }
      return t;
    }).toList();

    return Scaffold(
      body: Stack(
        children: [
          // Main content
          Positioned.fill(
            bottom: 0,
            child: navigationShell,
          ),
          // Tab bar at bottom
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: RbTabBar(
              tabs: tabsWithBadge,
              activeTab: tabIndex < tabs.length ? tabs[tabIndex].id : tabs[0].id,
              onTabChanged: (id) {
                final idx = tabs.indexWhere((t) => t.id == id);
                if (idx >= 0) navigationShell.goBranch(idx);
              },
            ),
          ),
          // Toast overlay
          if (toast != null)
            Positioned(
              top: MediaQuery.of(context).padding.top + 80,
              left: 0,
              right: 0,
              child: Center(child: RbToast(message: toast)),
            ),
        ],
      ),
    );
  }
}
