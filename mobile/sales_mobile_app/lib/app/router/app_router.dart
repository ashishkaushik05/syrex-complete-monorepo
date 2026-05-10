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
import '../../modules/orders/order_detail_page.dart';
import '../../modules/orders/orders_history_page.dart';
import '../../core/permissions/permission_service.dart';

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

      if (authStatus == SessionStatus.unknown ||
          authStatus == SessionStatus.refreshing) {
        return isSplashPath ? null : '/splash';
      }

      if (authStatus == SessionStatus.authenticated) {
        if (!salesAuthorized) {
          return isUnauthorizedPath ? null : '/unauthorized';
        }
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
        path: '/unauthorized',
        builder: (_, __) => const _UnauthorizedPage(),
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
          return OrderDetailPage(orderId: orderId);
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
          return InvoiceDetailPage(invoiceId: invoiceId);
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

class _UnauthorizedPage extends ConsumerWidget {
  const _UnauthorizedPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Unauthorized'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Your account does not have Sales application permissions.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
