import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../modules/auth/login_page.dart';
import '../../modules/catalog/catalog_page.dart';
import '../../modules/dashboard/dashboard_page.dart';
import '../../modules/invoices/invoice_history_page.dart';
import '../../modules/invoices/invoice_detail_page.dart';
import '../../modules/orders/create_order_page.dart';
import '../../modules/orders/dispatch_detail_page.dart';
import '../../modules/orders/order_detail_page.dart';
import '../../modules/orders/orders_history_page.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final path = state.fullPath ?? '/';
      final authStatus = session.status;
      final isAuthPath = path == '/login';
      final isSplashPath = path == '/splash';

      if (authStatus == SessionStatus.unknown ||
          authStatus == SessionStatus.refreshing) {
        return isSplashPath ? null : '/splash';
      }

      if (authStatus == SessionStatus.authenticated) {
        if (isAuthPath || isSplashPath) return '/dashboard';
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
        path: '/dashboard',
        builder: (_, __) => const DashboardPage(),
      ),
      GoRoute(
        path: '/orders/history',
        builder: (_, __) => const OrdersHistoryPage(),
      ),
      GoRoute(
        path: '/orders/create',
        builder: (_, __) => const CreateOrderPage(),
      ),
      GoRoute(
        path: '/orders/:orderId',
        builder: (_, state) {
          final orderId = state.pathParameters['orderId']!;
          final extra = state.extra as Map<String, dynamic>?;
          final outletId = extra?['outletId'] as String? ?? '';
          return OrderDetailPage(orderId: orderId, outletId: outletId);
        },
      ),
      GoRoute(
        path: '/invoices/history',
        builder: (_, __) => const InvoiceHistoryPage(),
      ),
      GoRoute(
        path: '/invoices/:invoiceId',
        builder: (_, state) {
          final invoiceId = state.pathParameters['invoiceId']!;
          final extra = state.extra as Map<String, dynamic>?;
          final outletId = extra?['outletId'] as String?;
          return InvoiceDetailPage(invoiceId: invoiceId, outletId: outletId);
        },
      ),
      GoRoute(
        path: '/dispatches/:dispatchId',
        builder: (_, state) {
          final dispatchId = state.pathParameters['dispatchId']!;
          final extra = state.extra as Map<String, dynamic>?;
          final outletId = extra?['outletId'] as String?;
          return DispatchDetailPage(
              dispatchId: dispatchId, outletId: outletId);
        },
      ),
      GoRoute(
        path: '/catalog',
        builder: (_, __) => const CatalogPage(),
      ),
    ],
  );
});

class _SplashPage extends StatelessWidget {
  const _SplashPage();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
