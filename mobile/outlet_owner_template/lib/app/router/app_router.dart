import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../modules/accounts/accounts_shell_page.dart';
import '../../modules/auth/login_page.dart';
import '../../modules/catalog/catalog_page.dart';
import '../../modules/dashboard/dashboard_page.dart';
import '../../modules/invoices/invoice_detail_page.dart';
import '../../modules/more/more_page.dart';
import '../../modules/orders/create_order_page.dart';
import '../../modules/orders/dispatch_detail_page.dart';
import '../../modules/orders/dispatch_history_page.dart';
import '../../modules/orders/order_detail_page.dart';
import '../../modules/orders/orders_history_page.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final path = state.fullPath ?? '/';
      final status = session.status;
      final isAuthPath = path == '/login';
      final isSplashPath = path == '/splash';

      if (status == SessionStatus.unknown ||
          status == SessionStatus.refreshing) {
        return isSplashPath ? null : '/splash';
      }

      if (status == SessionStatus.authenticated) {
        if (isAuthPath || isSplashPath) return '/home';
        return null;
      }

      if (status == SessionStatus.unauthenticated || status == SessionStatus.expired) {
        if (isAuthPath) return null;
        return '/login';
      }

      if (isAuthPath) return null;
      return '/login';
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (_, __) => const _SplashPage(),
      ),
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginPage(),
      ),

      // Full-screen routes
      GoRoute(
        path: '/orders/new',
        builder: (_, __) => const CreateOrderPage(),
      ),
      GoRoute(
        path: '/orders/:orderId',
        builder: (_, state) =>
            OrderDetailPage(orderId: state.pathParameters['orderId']!),
      ),
      GoRoute(
        path: '/dispatches/:dispatchId',
        builder: (_, state) =>
            DispatchDetailPage(dispatchId: state.pathParameters['dispatchId']!),
      ),
      GoRoute(
        path: '/invoices/:invoiceId',
        builder: (_, state) =>
            InvoiceDetailPage(invoiceId: state.pathParameters['invoiceId']!),
      ),
      GoRoute(
        path: '/accounts',
        builder: (_, __) => const AccountsShellPage(),
      ),

      // Bottom-tab shell
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            _AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home',
                builder: (_, __) => const DashboardPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/catalog',
                builder: (_, __) => const CatalogPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/orders/list',
                builder: (_, __) => const OrdersHistoryPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/track',
                builder: (_, __) => const DispatchHistoryPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                builder: (_, __) => const MorePage(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _AppShell extends StatelessWidget {
  const _AppShell({required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Catalog',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.local_shipping_outlined),
            selectedIcon: Icon(Icons.local_shipping),
            label: 'Track',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}

class _SplashPage extends StatelessWidget {
  const _SplashPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
