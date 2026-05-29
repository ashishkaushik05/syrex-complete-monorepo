import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme/app_theme.dart';
import '../../core/auth/session_controller.dart';
import '../../core/permissions/permission_service.dart';
import '../../modules/auth/login_page.dart';
import '../../modules/catalog/catalog_page.dart';
import '../../modules/catalog/product_detail_page.dart';
import '../../modules/dashboard/dashboard_page.dart';
import '../../modules/field/screens/agent_map_page.dart';
import '../../modules/field/screens/attendance_page.dart';
import '../../modules/field/screens/create_visit_page.dart';
import '../../modules/field/screens/field_home_page.dart';
import '../../modules/field/screens/report_stop_page.dart';
import '../../modules/field/screens/schedule_view_page.dart';
import '../../modules/field/screens/shift_history_page.dart';
import '../../modules/invoices/invoice_detail_page.dart';
import '../../modules/invoices/invoice_history_page.dart';
import '../../modules/orders/create_order_page.dart';
import '../../modules/orders/dispatch_detail_page.dart';
import '../../modules/orders/order_detail_page.dart';
import '../../modules/orders/orders_history_page.dart';
import '../../modules/profile/profile_page.dart';
import 'app_shell.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final path = state.fullPath ?? '/';
      final authStatus = session.status;
      final isAuthPath = path == '/login';
      final isSplashPath = path == '/splash';
      final isUnauthorizedPath = path == '/unauthorized';
      final salesAuthorized = ref.read(isSalesAuthorizedProvider);
      final canUseField = ref.read(canUseFieldProvider);

      if (authStatus == SessionStatus.unknown ||
          authStatus == SessionStatus.refreshing) {
        return isSplashPath ? null : '/splash';
      }

      if (authStatus == SessionStatus.authenticated) {
        if (!salesAuthorized) {
          return isUnauthorizedPath ? null : '/unauthorized';
        }
        if (path.startsWith('/field') && !canUseField) {
          return '/home';
        }
        if (isAuthPath || isSplashPath) return '/home';
        return null;
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
      GoRoute(
        path: '/unauthorized',
        builder: (_, __) => const _UnauthorizedPage(),
      ),
      // Legacy redirects
      GoRoute(path: '/dashboard', redirect: (_, __) => '/home'),
      GoRoute(path: '/orders/history', redirect: (_, __) => '/orders'),
      GoRoute(path: '/invoices/history', redirect: (_, __) => '/finance'),
      GoRoute(
        path: '/invoices/:invoiceId',
        redirect: (_, state) =>
            '/finance/invoices/${state.pathParameters['invoiceId']}',
      ),
      // Dispatch routes (outside shell — pushed as full page)
      GoRoute(
        path: '/dispatches/:dispatchId',
        builder: (_, state) =>
            DispatchDetailPage(dispatchId: state.pathParameters['dispatchId']!),
      ),

      // ── Shell ──────────────────────────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          // 0 — Home
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/home', builder: (_, __) => const DashboardPage()),
            ],
          ),
          // 1 — Catalog
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/catalog',
                builder: (_, __) => const CatalogPage(),
                routes: [
                  GoRoute(
                    path: 'product/:productId',
                    builder: (_, state) => ProductDetailPage(
                        productId: state.pathParameters['productId']!),
                  ),
                ],
              ),
            ],
          ),
          // 2 — Orders
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/orders',
                builder: (_, __) => const OrdersHistoryPage(),
                routes: [
                  GoRoute(
                    path: 'create',
                    builder: (_, __) => const CreateOrderPage(),
                  ),
                  GoRoute(
                    path: ':orderId',
                    builder: (_, state) => OrderDetailPage(
                        orderId: state.pathParameters['orderId']!),
                  ),
                ],
              ),
            ],
          ),
          // 3 — Field
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/field',
                builder: (_, __) => const FieldHomePage(),
                routes: [
                  GoRoute(
                      path: 'visit',
                      builder: (_, __) => const CreateVisitPage()),
                  GoRoute(
                      path: 'stop', builder: (_, __) => const ReportStopPage()),
                  GoRoute(
                      path: 'attendance',
                      builder: (_, __) => const AttendancePage()),
                  GoRoute(
                      path: 'map', builder: (_, __) => const AgentMapPage()),
                  GoRoute(
                      path: 'schedule',
                      builder: (_, __) => const ScheduleViewPage()),
                  GoRoute(
                      path: 'shift-history',
                      builder: (_, __) => const ShiftHistoryPage()),
                ],
              ),
            ],
          ),
          // 4 — Profile (with finance nested)
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (_, __) => const ProfilePage(),
              ),
              GoRoute(
                path: '/finance',
                builder: (_, __) => const InvoiceHistoryPage(),
                routes: [
                  GoRoute(
                    path: 'invoices/:invoiceId',
                    builder: (_, state) => InvoiceDetailPage(
                        invoiceId: state.pathParameters['invoiceId']!),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _SplashPage extends StatelessWidget {
  const _SplashPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator(color: RbColors.accent)),
    );
  }
}

class _UnauthorizedPage extends ConsumerWidget {
  const _UnauthorizedPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_outline, size: 48, color: RbColors.muted),
              const SizedBox(height: 16),
              Text(
                'Unauthorized',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              const Text(
                'Your account does not have Sales application permissions.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () =>
                    ref.read(sessionControllerProvider.notifier).logout(),
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
