import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/theme/app_colors.dart';
import '../shared/widgets/outlet_tab_bar.dart';
import 'theme_provider.dart';

class ShellScreen extends ConsumerWidget {
  final StatefulNavigationShell shell;
  const ShellScreen({super.key, required this.shell});

  OutletTab get _activeTab {
    switch (shell.currentIndex) {
      case 0:
        return OutletTab.home;
      case 1:
        return OutletTab.orders;
      case 2:
        return OutletTab.dispatches;
      case 3:
        return OutletTab.invoices;
      case 4:
        return OutletTab.more;
      default:
        return OutletTab.home;
    }
  }

  void _onTab(BuildContext context, OutletTab tab) {
    final paths = ['/home', '/orders', '/dispatches', '/invoices', '/more'];
    final idx = OutletTab.values.indexOf(tab);
    if (shell.currentIndex == idx) {
      // Pop to root of branch
      shell.goBranch(idx, initialLocation: true);
    } else {
      shell.goBranch(idx);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);

    return Scaffold(
      body: shell,
      bottomNavigationBar: OutletTabBar(
        active: _activeTab,
        onTap: (tab) => _onTab(context, tab),
        c: c,
      ),
    );
  }
}
