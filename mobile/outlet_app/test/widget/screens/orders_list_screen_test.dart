// ignore_for_file: avoid_redundant_argument_values

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

import 'package:outlet_app/modules/orders/orders_list_screen.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/core/models/order.dart';
import 'package:outlet_app/core/api/outlet_portal_client.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockOutletPortalClient extends Mock implements OutletPortalClient {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

SessionState _makeSession() => SessionState(
      accessToken: 'tok',
      refreshToken: 'ref',
      orgId: 'org-1',
      user: SessionUser(
        id: 'user-1',
        email: 'outlet@example.com',
        name: 'Test Outlet',
        userType: 'outlet',
        outletId: 'outlet-1',
        permissions: ['*'],
      ),
    );

OrderDto _makeOrder({
  String id = 'order-1',
  String orderNumber = 'ORD-0001',
  String status = 'pending_approval',
  List<OrderLineDto> lines = const [],
}) =>
    OrderDto(
      id: id,
      orderNumber: orderNumber,
      outletId: 'outlet-1',
      status: status,
      priority: 'medium',
      orderDate: '2026-06-01',
      deliveryAddress: '1 Test St',
      totalValue: '5000',
      subtotalValue: '4500',
      taxTotal: '500',
      lines: lines,
    );

// ---------------------------------------------------------------------------
// Widget builder
// ---------------------------------------------------------------------------

Widget _buildScreen({
  required MockOutletPortalClient client,
  String? initialFilter,
}) {
  return ProviderScope(
    overrides: [
      sessionControllerProvider.overrideWith(() => _FakeSessionController(_makeSession())),
      outletPortalClientProvider.overrideWith((_) => client),
    ],
    child: MaterialApp(
      home: OrdersListScreen(initialFilter: initialFilter),
      onGenerateRoute: (settings) => MaterialPageRoute(
        builder: (_) => Scaffold(body: Text('Route: ${settings.name}')),
        settings: settings,
      ),
    ),
  );
}

class _FakeSessionController extends SessionController {
  final SessionState _s;
  _FakeSessionController(this._s);

  @override
  SessionState build() => _s;
}

// ===========================================================================
// Tests
// ===========================================================================

void main() {
  group('OrdersListScreen', () {
    late MockOutletPortalClient client;

    setUp(() {
      client = MockOutletPortalClient();
    });

    // -----------------------------------------------------------------------
    // Loading state
    // -----------------------------------------------------------------------

    group('loading state', () {
      testWidgets('shows skeleton tiles (6 items at 88px) while loading', (tester) async {
        // Completer keeps the future pending so the provider stays in loading state.
        final completer = Completer<PagedOrders>();
        when(() => client.orderHistory(any(), status: any(named: 'status')))
            .thenAnswer((_) => completer.future);

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pump(); // one frame — provider is loading

        // The skeleton renders 6 items via ListView(itemCount: 6).
        // Container(height: 88, ...) creates a ConstrainedBox with maxHeight 88.
        final boxes = tester.widgetList<ConstrainedBox>(find.byType(ConstrainedBox));
        final skeletonTiles = boxes
            .where((b) => b.constraints.maxHeight == 88)
            .toList();
        expect(skeletonTiles.length, greaterThanOrEqualTo(6));

        // Complete the future to avoid pending timer warning.
        completer.complete(const PagedOrders(items: [], nextCursor: null));
        await tester.pumpAndSettle();
      });
    });

    // -----------------------------------------------------------------------
    // Error state
    // -----------------------------------------------------------------------

    group('error state', () {
      testWidgets('shows centered error text "Failed to load orders"', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenThrow(Exception('network error'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Failed to load orders'), findsOneWidget);
      });

      testWidgets('no retry button shown in error state', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenThrow(Exception('network error'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Retry'), findsNothing);
        expect(find.byType(ElevatedButton), findsNothing);
        expect(find.byType(TextButton), findsNothing);
      });
    });

    // -----------------------------------------------------------------------
    // Empty state
    // -----------------------------------------------------------------------

    group('empty state', () {
      testWidgets('shows EmptyState widget when list is empty', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('No orders'), findsOneWidget);
      });

      testWidgets('empty state has "Place an order" / "Browse catalog" CTA button',
          (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        // The spec says action label is 'Place an order'
        expect(find.text('Place an order'), findsOneWidget);
      });
    });

    // -----------------------------------------------------------------------
    // Data state
    // -----------------------------------------------------------------------

    group('data state', () {
      testWidgets('order list tiles are rendered with correct data', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => PagedOrders(
                  items: [
                    _makeOrder(id: 'o-1', orderNumber: 'ORD-0001'),
                    _makeOrder(id: 'o-2', orderNumber: 'ORD-0002'),
                  ],
                  nextCursor: null,
                ));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('#ORD-0001'), findsOneWidget);
        expect(find.text('#ORD-0002'), findsOneWidget);
      });
    });

    // -----------------------------------------------------------------------
    // Filter chips
    // -----------------------------------------------------------------------

    group('filter chips', () {
      testWidgets('5 chips are rendered in correct order', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('all'), findsOneWidget);
        expect(find.text('pending_approval'), findsOneWidget);
        expect(find.text('approved'), findsOneWidget);
        expect(find.text('dispatched'), findsOneWidget);
        expect(find.text('cancelled'), findsOneWidget);
      });

      testWidgets('tapping "approved" chip triggers re-fetch with approved status',
          (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('approved'));
        await tester.pumpAndSettle();

        verify(() => client.orderHistory(
              any(),
              status: 'approved',
            )).called(greaterThanOrEqualTo(1));
      });

      testWidgets('"All" chip maps to null status', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        // Tap another chip first, then tap "All"
        await tester.tap(find.text('approved'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('all'));
        await tester.pumpAndSettle();

        // The last call with null status (no filter)
        verify(() => client.orderHistory(
              any(),
              status: null,
            )).called(greaterThanOrEqualTo(1));
      });

      testWidgets('tapping "pending_approval" chip re-fetches with that status', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('pending_approval'));
        await tester.pumpAndSettle();

        verify(() => client.orderHistory(
              any(),
              status: 'pending_approval',
            )).called(greaterThanOrEqualTo(1));
      });

      testWidgets('tapping "dispatched" chip re-fetches with dispatched status', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('dispatched'));
        await tester.pumpAndSettle();

        verify(() => client.orderHistory(
              any(),
              status: 'dispatched',
            )).called(greaterThanOrEqualTo(1));
      });

      testWidgets('tapping "cancelled" chip re-fetches with cancelled status', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('cancelled'));
        await tester.pumpAndSettle();

        verify(() => client.orderHistory(
              any(),
              status: 'cancelled',
            )).called(greaterThanOrEqualTo(1));
      });
    });

    // -----------------------------------------------------------------------
    // Pull-to-refresh
    // -----------------------------------------------------------------------

    group('pull-to-refresh', () {
      testWidgets('pull-to-refresh re-fetches orders', (tester) async {
        var callCount = 0;
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async {
          callCount++;
          return PagedOrders(
            items: [_makeOrder(orderNumber: 'ORD-000$callCount')],
            nextCursor: null,
          );
        });

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        final initialCount = callCount;

        // Simulate pull-to-refresh
        await tester.fling(find.byType(ListView).first, const Offset(0, 400), 800);
        await tester.pumpAndSettle();

        expect(callCount, greaterThan(initialCount));
      });
    });

    // -----------------------------------------------------------------------
    // FAB
    // -----------------------------------------------------------------------

    group('FAB', () {
      testWidgets('FAB is present', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.byType(FloatingActionButton), findsOneWidget);
        expect(find.text('New order'), findsOneWidget);
      });

      testWidgets('tapping FAB navigates to /orders/new', (tester) async {
        final List<String> routes = [];

        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => const PagedOrders(items: [], nextCursor: null));

        final router = GoRouter(
          initialLocation: '/',
          routes: [
            GoRoute(path: '/', builder: (_, __) => const OrdersListScreen()),
            GoRoute(path: '/orders/new', builder: (_, state) {
              routes.add(state.matchedLocation);
              return const Scaffold(body: Text('New Order'));
            }),
          ],
        );

        await tester.pumpWidget(ProviderScope(
          overrides: [
            sessionControllerProvider.overrideWith(() => _FakeSessionController(_makeSession())),
            outletPortalClientProvider.overrideWith((_) => client),
          ],
          child: MaterialApp.router(routerConfig: router),
        ));
        await tester.pumpAndSettle();

        await tester.tap(find.byType(FloatingActionButton));
        await tester.pumpAndSettle();

        expect(routes, contains('/orders/new'));
      });
    });

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    group('navigation', () {
      testWidgets('tapping an order tile navigates to /orders/<id>', (tester) async {
        final List<String> routes = [];

        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => PagedOrders(
                  items: [_makeOrder(id: 'order-xyz', orderNumber: 'ORD-0042')],
                  nextCursor: null,
                ));

        final router = GoRouter(
          initialLocation: '/',
          routes: [
            GoRoute(path: '/', builder: (_, __) => const OrdersListScreen()),
            GoRoute(path: '/orders/:id', builder: (_, state) {
              routes.add(state.matchedLocation);
              return Scaffold(body: Text('Order: ${state.pathParameters['id']}'));
            }),
          ],
        );

        await tester.pumpWidget(ProviderScope(
          overrides: [
            sessionControllerProvider.overrideWith(() => _FakeSessionController(_makeSession())),
            outletPortalClientProvider.overrideWith((_) => client),
          ],
          child: MaterialApp.router(routerConfig: router),
        ));
        await tester.pumpAndSettle();

        await tester.tap(find.text('#ORD-0042'));
        await tester.pumpAndSettle();

        expect(routes, contains('/orders/order-xyz'));
      });
    });

    // -----------------------------------------------------------------------
    // Pagination gap
    // -----------------------------------------------------------------------

    group('pagination gap', () {
      testWidgets('only first page is loaded — no "load more" button visible', (tester) async {
        when(() => client.orderHistory(any(),
                status: any(named: 'status')))
            .thenAnswer((_) async => PagedOrders(
                  items: List.generate(
                      20, (i) => _makeOrder(id: 'o-$i', orderNumber: 'ORD-${i.toString().padLeft(4, '0')}')),
                  nextCursor: 'cursor-abc', // there IS a next page
                ));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Load more'), findsNothing);
        expect(find.text('Show more'), findsNothing);
        expect(find.text('Next page'), findsNothing);
      });
    });
  });
}
