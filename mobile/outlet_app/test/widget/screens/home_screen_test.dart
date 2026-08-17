// ignore_for_file: avoid_redundant_argument_values

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/modules/home/home_screen.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/core/models/outlet.dart';
import 'package:outlet_app/core/models/order.dart';
import 'package:outlet_app/core/models/dispatch.dart';
import 'package:outlet_app/core/models/invoice.dart';
import 'package:outlet_app/core/api/outlet_portal_client.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockOutletPortalClient extends Mock implements OutletPortalClient {}

// ---------------------------------------------------------------------------
// Helpers — test data
// ---------------------------------------------------------------------------

SessionUser _makeUser({String name = 'Test User', String? outletId = 'outlet-1'}) =>
    SessionUser(
      id: 'user-1',
      email: 'test@example.com',
      name: name,
      userType: 'outlet',
      outletId: outletId,
      permissions: ['*'],
    );

SessionState _makeSession({SessionUser? user}) => SessionState(
      accessToken: 'token-123',
      refreshToken: 'refresh-123',
      orgId: 'org-1',
      user: user ?? _makeUser(),
    );

OutletSummaryDto _makeSummary({
  String outstandingLive = '75000',
  String outstandingSnapshot = '72000',
  int openInvoicesCount = 3,
  int ordersCount = 12,
}) =>
    OutletSummaryDto(
      outletId: 'outlet-1',
      outstandingLive: outstandingLive,
      outstandingSnapshot: outstandingSnapshot,
      openInvoicesCount: openInvoicesCount,
      ordersCount: ordersCount,
    );

OrderDto _makeOrder({
  String id = 'order-1',
  String orderNumber = 'ORD-0001',
  String status = 'pending_approval',
}) =>
    OrderDto(
      id: id,
      orderNumber: orderNumber,
      outletId: 'outlet-1',
      status: status,
      priority: 'medium',
      orderDate: '2026-06-01',
      deliveryAddress: '123 Main St',
      totalValue: '10000',
      subtotalValue: '9000',
      taxTotal: '1000',
      lines: [],
    );

DispatchDto _makeDispatch({
  String id = 'dispatch-1',
  String deliveryStatus = 'in_transit',
}) =>
    DispatchDto(
      id: id,
      deliveryStatus: deliveryStatus,
      transporterName: 'Test Transporter',
      vehicleNumber: 'MH01AB1234',
    );

InvoiceDto _makeInvoice({
  String id = 'invoice-1',
  // due date well in the past
  String? dueDate = '2020-01-01',
  String amountDue = '5000',
}) =>
    InvoiceDto(
      id: id,
      invoiceNumber: 'INV-001',
      orderId: 'order-1',
      outletId: 'outlet-1',
      total: '5000',
      amountPaid: '0',
      dueDate: dueDate,
      amountDue: amountDue,
    );

// ---------------------------------------------------------------------------
// Provider override factories
// ---------------------------------------------------------------------------

/// Returns a ProviderScope that wraps HomeScreen with all four data providers
/// resolved to their supplied values.
Widget _buildHome({
  required SessionState session,
  AsyncValue<OutletSummaryDto>? summary,
  AsyncValue<PagedOrders>? recentOrders,
  AsyncValue<PagedDispatches>? dispatches,
  AsyncValue<PagedInvoices>? invoices,
  List<Override> extra = const [],
}) {
  return ProviderScope(
    overrides: [
      sessionControllerProvider.overrideWith(() => _FakeSessionController(session)),
      // The four file-private providers are accessed only via the screen widget;
      // we override the OutletPortalClient that feeds them.
      outletPortalClientProvider.overrideWith((ref) {
        final client = MockOutletPortalClient();

        if (summary != null) {
          summary.when(
            data: (d) => when(() => client.summary(any())).thenAnswer((_) async => d),
            error: (e, _) => when(() => client.summary(any())).thenThrow(e),
            loading: () => when(() => client.summary(any()))
                .thenAnswer((_) => Future.delayed(const Duration(minutes: 10))),
          );
        } else {
          when(() => client.summary(any())).thenAnswer((_) async => _makeSummary());
        }

        if (recentOrders != null) {
          recentOrders.when(
            data: (d) => when(() => client.orderHistory(any(), limit: any(named: 'limit')))
                .thenAnswer((_) async => d),
            error: (e, _) => when(() => client.orderHistory(any(), limit: any(named: 'limit')))
                .thenThrow(e),
            loading: () => when(() => client.orderHistory(any(), limit: any(named: 'limit')))
                .thenAnswer((_) => Future.delayed(const Duration(minutes: 10))),
          );
        } else {
          when(() => client.orderHistory(any(), limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedOrders(items: [], nextCursor: null));
        }

        if (dispatches != null) {
          dispatches.when(
            data: (d) => when(() => client.dispatchHistory(any(), limit: any(named: 'limit')))
                .thenAnswer((_) async => d),
            error: (e, _) => when(() => client.dispatchHistory(any(), limit: any(named: 'limit')))
                .thenThrow(e),
            loading: () => when(() => client.dispatchHistory(any(), limit: any(named: 'limit')))
                .thenAnswer((_) => Future.delayed(const Duration(minutes: 10))),
          );
        } else {
          when(() => client.dispatchHistory(any(), limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedDispatches(items: [], nextCursor: null));
        }

        if (invoices != null) {
          invoices.when(
            data: (d) => when(() => client.invoiceHistory(any(), limit: any(named: 'limit')))
                .thenAnswer((_) async => d),
            error: (e, _) => when(() => client.invoiceHistory(any(), limit: any(named: 'limit')))
                .thenThrow(e),
            loading: () => when(() => client.invoiceHistory(any(), limit: any(named: 'limit')))
                .thenAnswer((_) => Future.delayed(const Duration(minutes: 10))),
          );
        } else {
          when(() => client.invoiceHistory(any(), limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedInvoices(items: [], nextCursor: null));
        }

        return client;
      }),
      ...extra,
    ],
    child: const MaterialApp(home: HomeScreen()),
  );
}

// ---------------------------------------------------------------------------
// Fake SessionController
// ---------------------------------------------------------------------------

class _FakeSessionController extends SessionController {
  final SessionState _state;
  _FakeSessionController(this._state);

  @override
  SessionState build() => _state;
}

// ===========================================================================
// Tests
// ===========================================================================

void main() {
  group('HomeScreen', () {
    // -----------------------------------------------------------------------
    // Loading state
    // -----------------------------------------------------------------------

    group('loading state', () {
      testWidgets('shows skeleton placeholders while future is pending', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: const AsyncValue.loading(),
              recentOrders: const AsyncValue.loading(),
              dispatches: const AsyncValue.loading(),
              invoices: const AsyncValue.loading(),
            ),
          );
          // pump once to let the widget tree build without settling async ops
          await tester.pump();

          // The skeleton containers should be present. We look for the
          // characteristic height of the balance banner skeleton (160 px)
          // and the list skeleton tiles (80 px each).
          // Since skeletons are plain colored boxes (no text), we verify that
          // no outlet data text is visible yet.
          expect(find.text('₹75,000'), findsNothing);
          expect(find.text('12 total orders'), findsNothing);

          // The identity header and CTA are always visible even while loading.
          expect(find.text('Good morning'), findsOneWidget);
          expect(find.text('Place a new order'), findsOneWidget);
        });
      });

      testWidgets('always-visible widgets are present during loading', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: const AsyncValue.loading(),
              recentOrders: const AsyncValue.loading(),
              dispatches: const AsyncValue.loading(),
              invoices: const AsyncValue.loading(),
            ),
          );
          await tester.pump();

          expect(find.text('Place a new order'), findsOneWidget);
          expect(find.text('Recent orders'), findsOneWidget);
          expect(find.text('Active dispatches'), findsOneWidget);
          expect(find.text('Overdue invoices'), findsOneWidget);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Error state — silent collapse
    // -----------------------------------------------------------------------

    group('error state (silent collapse)', () {
      testWidgets('no error text is shown when summary errors', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.error(Exception('network'), StackTrace.empty),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Failed to load'), findsNothing);
          expect(find.text('Error'), findsNothing);
          expect(find.text('Retry'), findsNothing);
          // Balance banner text should not appear
          expect(find.text('OUTSTANDING BALANCE'), findsNothing);
        });
      });

      testWidgets('no retry button shown when recentOrders errors', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: AsyncValue.error(Exception('net'), StackTrace.empty),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Retry'), findsNothing);
          expect(find.byType(ElevatedButton), findsNothing);
        });
      });

      testWidgets('no error text shown when dispatches errors', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: AsyncValue.error(Exception('net'), StackTrace.empty),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Failed to load dispatches'), findsNothing);
          expect(find.text('Error'), findsNothing);
        });
      });

      testWidgets('no error text shown when invoices errors', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: AsyncValue.error(Exception('net'), StackTrace.empty),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Failed to load invoices'), findsNothing);
          expect(find.text('Error'), findsNothing);
        });
      });

      testWidgets('all four providers erroring leaves page partially visible but no errors shown',
          (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.error(Exception('net'), StackTrace.empty),
              recentOrders: AsyncValue.error(Exception('net'), StackTrace.empty),
              dispatches: AsyncValue.error(Exception('net'), StackTrace.empty),
              invoices: AsyncValue.error(Exception('net'), StackTrace.empty),
            ),
          );
          await tester.pumpAndSettle();

          // Always-visible widgets still present
          expect(find.text('Good morning'), findsOneWidget);
          expect(find.text('Place a new order'), findsOneWidget);

          // No error indicators anywhere
          expect(find.text('Error'), findsNothing);
          expect(find.text('Retry'), findsNothing);
          expect(find.byType(SnackBar), findsNothing);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Data state
    // -----------------------------------------------------------------------

    group('data state', () {
      testWidgets('outlet name (user name) is rendered in identity header', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(user: _makeUser(name: 'Ashish Kaushik')),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Ashish Kaushik'), findsOneWidget);
        });
      });

      testWidgets('outstanding balance is rendered formatted as INR', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              // 75000 → ₹75,000
              summary: AsyncValue.data(_makeSummary(outstandingLive: '75000')),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('₹75,000'), findsOneWidget);
        });
      });

      testWidgets('credit limit / open invoices count is rendered in banner subtitle',
          (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary(openInvoicesCount: 3, ordersCount: 12)),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          // Banner subtitle: "3 open invoices · 12 total orders"
          expect(find.textContaining('3 open invoices'), findsOneWidget);
          expect(find.textContaining('12 total orders'), findsOneWidget);
        });
      });

      testWidgets('stat cards are shown when summary data loads', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary(ordersCount: 7, openInvoicesCount: 2)),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Total orders'), findsOneWidget);
          expect(find.text('In transit'), findsOneWidget);
          expect(find.text('Open invoices'), findsOneWidget);
          // ordersCount value
          expect(find.text('7'), findsOneWidget);
          // openInvoicesCount value
          expect(find.text('2'), findsOneWidget);
        });
      });

      testWidgets(
          '"In transit" stat card value is hardcoded "—" regardless of dispatch data',
          (tester) async {
        await mockNetworkImagesFor(() async {
          // Even with 5 in-transit dispatches, the card should show "—"
          final dispatches = PagedDispatches(
            items: List.generate(
                5, (i) => _makeDispatch(id: 'd-$i', deliveryStatus: 'in_transit')),
            nextCursor: null,
          );

          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: AsyncValue.data(dispatches),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          // The "In transit" card value must be em-dash, not "5"
          expect(find.text('—'), findsWidgets); // at least one em dash
          expect(find.text('5'), findsNothing);
        });
      });

      testWidgets('recent orders section shows order items when data is available',
          (tester) async {
        await mockNetworkImagesFor(() async {
          final orders = PagedOrders(
            items: [
              _makeOrder(id: 'o-1', orderNumber: 'ORD-0001'),
              _makeOrder(id: 'o-2', orderNumber: 'ORD-0002'),
            ],
            nextCursor: null,
          );

          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: AsyncValue.data(orders),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('#ORD-0001'), findsOneWidget);
          expect(find.text('#ORD-0002'), findsOneWidget);
        });
      });

      testWidgets('recent invoices section shows invoice items when data is available',
          (tester) async {
        await mockNetworkImagesFor(() async {
          final invoices = PagedInvoices(
            items: [
              // past due date + positive amount → will appear as overdue
              _makeInvoice(id: 'inv-1', dueDate: '2020-01-01', amountDue: '3000'),
            ],
            nextCursor: null,
          );

          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: AsyncValue.data(invoices),
            ),
          );
          await tester.pumpAndSettle();

          // The invoice tile should appear in the overdue section
          expect(find.byKey(const Key('invoice-tile-inv-1')), findsOneWidget);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Hardcoded behaviors
    // -----------------------------------------------------------------------

    group('hardcoded behaviors', () {
      testWidgets('"Good morning" greeting is always shown regardless of time of day',
          (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          expect(find.text('Good morning'), findsOneWidget);
          // Must not show time-based alternatives
          expect(find.text('Good afternoon'), findsNothing);
          expect(find.text('Good evening'), findsNothing);
        });
      });

      testWidgets('notification bell tap does nothing (no navigation, no state change)',
          (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          // Find and tap the bell button
          final bell = find.byIcon(Icons.notifications_outlined);
          expect(bell, findsOneWidget);
          await tester.tap(bell);
          await tester.pumpAndSettle();

          // Screen must still be showing Home content — no navigation occurred
          expect(find.text('Good morning'), findsOneWidget);
          expect(find.text('Place a new order'), findsOneWidget);
        });
      });

      testWidgets('red dot on notification bell is always visible', (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(_makeSummary()),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          // Red dot is a small 8×8 circle container. We verify it by
          // finding its key or by checking that a red-colored container
          // exists near the bell icon.
          expect(find.byKey(const Key('notification-dot')), findsOneWidget);
        });
      });
    });

    // -----------------------------------------------------------------------
    // outstandingSnapshot is NOT rendered
    // -----------------------------------------------------------------------

    group('outstandingSnapshot field', () {
      testWidgets('outstandingSnapshot value is not rendered anywhere on screen',
          (tester) async {
        await mockNetworkImagesFor(() async {
          await tester.pumpWidget(
            _buildHome(
              session: _makeSession(),
              summary: AsyncValue.data(
                // outstandingSnapshot has a distinctive value: 99999
                // outstandingLive is 75000 (₹75,000)
                _makeSummary(
                  outstandingLive: '75000',
                  outstandingSnapshot: '99999',
                ),
              ),
              recentOrders: const AsyncValue.data(PagedOrders(items: [], nextCursor: null)),
              dispatches: const AsyncValue.data(PagedDispatches(items: [], nextCursor: null)),
              invoices: const AsyncValue.data(PagedInvoices(items: [], nextCursor: null)),
            ),
          );
          await tester.pumpAndSettle();

          // outstandingLive is shown
          expect(find.text('₹75,000'), findsOneWidget);
          // outstandingSnapshot (99999 → ₹99,999) must NOT appear
          expect(find.text('₹99,999'), findsNothing);
          expect(find.text('99999'), findsNothing);
          expect(find.text('99,999'), findsNothing);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    group('navigation', () {
      testWidgets('tapping a recent order tile navigates to order detail route', (tester) async {
        await mockNetworkImagesFor(() async {
          final List<String> navigatedRoutes = [];

          final router = GoRouter(
            initialLocation: '/',
            routes: [
              GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
              GoRoute(path: '/orders/:id', builder: (_, state) {
                navigatedRoutes.add(state.matchedLocation);
                return Scaffold(body: Text('Order: ${state.pathParameters['id']}'));
              }),
            ],
          );

          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                sessionControllerProvider
                    .overrideWith(() => _FakeSessionController(_makeSession())),
                outletPortalClientProvider.overrideWith((ref) {
                  final client = MockOutletPortalClient();
                  when(() => client.summary(any()))
                      .thenAnswer((_) async => _makeSummary());
                  when(() => client.orderHistory(any(), limit: any(named: 'limit')))
                      .thenAnswer((_) async => PagedOrders(
                            items: [_makeOrder(id: 'order-abc', orderNumber: 'ORD-0099')],
                            nextCursor: null,
                          ));
                  when(() => client.dispatchHistory(any(), limit: any(named: 'limit')))
                      .thenAnswer(
                          (_) async => const PagedDispatches(items: [], nextCursor: null));
                  when(() => client.invoiceHistory(any(), limit: any(named: 'limit')))
                      .thenAnswer(
                          (_) async => const PagedInvoices(items: [], nextCursor: null));
                  return client;
                }),
              ],
              child: MaterialApp.router(routerConfig: router),
            ),
          );
          await tester.pumpAndSettle();

          // Tap the order tile
          await tester.tap(find.text('#ORD-0099'));
          await tester.pumpAndSettle();

          expect(navigatedRoutes, contains('/orders/order-abc'));
        });
      });

      testWidgets('tapping "See all" on orders section navigates to orders tab', (tester) async {
        await mockNetworkImagesFor(() async {
          final List<String> navigatedRoutes = [];

          final router = GoRouter(
            initialLocation: '/',
            routes: [
              GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
              GoRoute(path: '/orders', builder: (_, state) {
                navigatedRoutes.add(state.matchedLocation);
                return const Scaffold(body: Text('Orders'));
              }),
            ],
          );

          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                sessionControllerProvider
                    .overrideWith(() => _FakeSessionController(_makeSession())),
                outletPortalClientProvider.overrideWith((ref) {
                  final client = MockOutletPortalClient();
                  when(() => client.summary(any()))
                      .thenAnswer((_) async => _makeSummary());
                  when(() => client.orderHistory(any(), limit: any(named: 'limit')))
                      .thenAnswer(
                          (_) async => const PagedOrders(items: [], nextCursor: null));
                  when(() => client.dispatchHistory(any(), limit: any(named: 'limit')))
                      .thenAnswer(
                          (_) async => const PagedDispatches(items: [], nextCursor: null));
                  when(() => client.invoiceHistory(any(), limit: any(named: 'limit')))
                      .thenAnswer(
                          (_) async => const PagedInvoices(items: [], nextCursor: null));
                  return client;
                }),
              ],
              child: MaterialApp.router(routerConfig: router),
            ),
          );
          await tester.pumpAndSettle();

          // "See all" link in Recent orders section header
          final seeAllFinder = find.text('See all').first;
          await tester.tap(seeAllFinder);
          await tester.pumpAndSettle();

          expect(navigatedRoutes, contains('/orders'));
        });
      });
    });
  });
}
