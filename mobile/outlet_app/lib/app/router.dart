import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth/session_controller.dart';
import '../core/models/session.dart';
import '../modules/auth/login_screen.dart';
import '../modules/home/home_screen.dart';
import '../modules/orders/orders_list_screen.dart';
import '../modules/orders/order_detail_screen.dart';
import '../modules/create_order/create_order_flow.dart';
import '../modules/dispatches/dispatches_list_screen.dart';
import '../modules/dispatches/dispatch_detail_screen.dart';
import '../modules/invoices/invoices_list_screen.dart';
import '../modules/invoices/invoice_detail_screen.dart';
import '../modules/more/more_screen.dart';
import '../modules/profile/profile_screen.dart';
import '../modules/payments/payments_list_screen.dart';
import '../modules/payments/payment_detail_screen.dart';
import '../modules/service/complaints_list_screen.dart';
import '../modules/service/raise_complaint_screen.dart';
import '../modules/service/complaint_detail_screen.dart';
import '../modules/catalog/catalog_screen.dart';
import '../modules/checkout/checkout_screen.dart';
import '../modules/splash/splash_screen.dart';
import 'shell_screen.dart';

class _SessionRouterNotifier extends ChangeNotifier {
  final Ref _ref;
  _SessionRouterNotifier(this._ref) {
    _ref.listen<SessionState>(sessionControllerProvider, (_, __) => notifyListeners());
  }
  SessionState get session => _ref.read(sessionControllerProvider);
}

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = _SessionRouterNotifier(ref);
  ref.onDispose(notifier.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: notifier,
    redirect: (context, state) {
      final session = notifier.session;
      final loc = state.matchedLocation;

      // Show splash while the session restore is running.
      if (session.isRestoring) {
        return loc == '/splash' ? null : '/splash';
      }

      // Not authenticated → login.
      if (!session.isAuthenticated) {
        return loc == '/login' ? null : '/login';
      }

      // Authenticated → never linger on splash or login.
      if (loc == '/splash' || loc == '/login') return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/checkout',
        pageBuilder: (_, __) => const MaterialPage(
          fullscreenDialog: true,
          child: CheckoutScreen(),
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => ShellScreen(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/home',
              builder: (_, __) => const HomeScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/orders',
              builder: (_, state) => OrdersListScreen(
                initialFilter: state.uri.queryParameters['filter'],
              ),
              routes: [
                GoRoute(
                  path: 'new',
                  pageBuilder: (_, __) => const MaterialPage(
                    fullscreenDialog: true,
                    child: CreateOrderFlow(),
                  ),
                ),
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      OrderDetailScreen(orderId: state.pathParameters['id']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/dispatches',
              builder: (_, __) => const DispatchesListScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) => DispatchDetailScreen(
                      dispatchId: state.pathParameters['id']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/invoices',
              builder: (_, __) => const InvoicesListScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) => InvoiceDetailScreen(
                      invoiceId: state.pathParameters['id']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/more',
              builder: (_, __) => const MoreScreen(),
              routes: [
                GoRoute(
                    path: 'profile', builder: (_, __) => const ProfileScreen()),
                GoRoute(
                  path: 'payments',
                  builder: (_, __) => const PaymentsListScreen(),
                  routes: [
                    GoRoute(
                      path: ':id',
                      builder: (_, state) => PaymentDetailScreen(
                          paymentId: state.pathParameters['id']!),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'service',
                  builder: (_, __) => const ComplaintsListScreen(),
                  routes: [
                    GoRoute(
                        path: 'new',
                        builder: (_, __) => const RaiseComplaintScreen()),
                    GoRoute(
                      path: ':id',
                      builder: (_, state) => ComplaintDetailScreen(
                          complaintId: state.pathParameters['id']!),
                    ),
                  ],
                ),
                GoRoute(
                    path: 'catalog',
                    builder: (_, __) => const CatalogScreen()),
              ],
            ),
          ]),
        ],
      ),
    ],
  );
});
