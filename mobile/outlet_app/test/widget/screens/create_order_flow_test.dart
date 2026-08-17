// ignore_for_file: avoid_redundant_argument_values

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/modules/create_order/create_order_flow.dart';
import 'package:outlet_app/modules/checkout/checkout_screen.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/core/models/order.dart';
import 'package:outlet_app/core/models/catalog.dart';
import 'package:outlet_app/core/api/catalog_client.dart';
import 'package:outlet_app/core/api/orders_client.dart';
import 'package:outlet_app/core/cart/cart_provider.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockCatalogClient extends Mock implements CatalogClient {}

class MockOrdersClient extends Mock implements OrdersClient {}

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

ProductDto _makeProduct({
  String id = 'prod-1',
  String name = 'Battery 12V',
  String sku = 'SKU-BATT-12V',
  String basePrice = '1500',
}) =>
    ProductDto(
      id: id,
      categoryId: 'cat-1',
      name: name,
      sku: sku,
      basePrice: basePrice,
      gstRate: '18',
      warrantyMonths: 12,
      isActive: true,
    );

OrderDto _makeCreatedOrder({String id = 'new-order-1'}) => OrderDto(
      id: id,
      orderNumber: 'ORD-9999',
      outletId: 'outlet-1',
      status: 'pending_approval',
      priority: 'medium',
      orderDate: '2026-06-06',
      deliveryAddress: '1 Main St',
      totalValue: '1500',
      subtotalValue: '1350',
      taxTotal: '150',
      lines: [],
    );

class _FakeSessionController extends SessionController {
  final SessionState _s;
  _FakeSessionController(this._s);

  @override
  SessionState build() => _s;
}

// ---------------------------------------------------------------------------
// Widget builder
// ---------------------------------------------------------------------------

Widget _buildFlow({
  required MockCatalogClient catalogClient,
  required MockOrdersClient ordersClient,
}) {
  final router = GoRouter(
    initialLocation: '/new-order',
    routes: [
      GoRoute(
        path: '/new-order',
        builder: (_, __) => const CreateOrderFlow(),
      ),
      GoRoute(
        path: '/checkout',
        builder: (_, __) => const CheckoutScreen(),
      ),
      GoRoute(
        path: '/orders/:id',
        builder: (_, state) =>
            Scaffold(body: Text('Order:${state.pathParameters['id']}')),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      sessionControllerProvider
          .overrideWith(() => _FakeSessionController(_makeSession())),
      catalogClientProvider.overrideWith((_) => catalogClient),
      ordersClientProvider.overrideWith((_) => ordersClient),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

// ===========================================================================
// Tests
// ===========================================================================

void main() {
  setUpAll(() {
    registerFallbackValue(const CreateOrderInput(
      outletId: '',
      deliveryAddress: '',
      priority: 'medium',
      lines: [],
    ));
  });

  group('CreateOrderFlow', () {
    late MockCatalogClient catalogClient;
    late MockOrdersClient ordersClient;

    setUp(() {
      catalogClient = MockCatalogClient();
      ordersClient = MockOrdersClient();
    });

    // -----------------------------------------------------------------------
    // Cart behavior
    // -----------------------------------------------------------------------

    group('cart behavior', () {
      testWidgets(
          'adding a product to cart updates the cart count in the app bar',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct(id: 'p-1', name: 'Battery 12V')],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // No cart count badge yet
          expect(find.textContaining('item'), findsNothing);

          // Tap the increment button on the first product (QtyStepper + button)
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          // Cart count badge should appear with "1 item"
          expect(find.textContaining('1 item'), findsAtLeast(1));
        });
      });

      testWidgets('incrementing qty updates cart total in badge',
          (tester) async {
        await mockNetworkImagesFor(() async {
          final product = _makeProduct(
            id: 'p-1',
            name: 'Battery 12V',
            basePrice: '1500',
          );

          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [product],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Add 2 units
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();
          ProviderScope.containerOf(
                  tester.element(find.byType(CreateOrderFlow)))
              .read(cartProvider.notifier)
              .setQty(product, 2);
          await tester.pumpAndSettle();

          // 2 × ₹1,500 plus 18% GST = ₹3,540 shown in the badge
          expect(find.textContaining('2 items'), findsAtLeast(1));
          expect(find.textContaining('3,540'), findsAtLeast(1));
        });
      });

      testWidgets('removing a product from cart removes it from cart state',
          (tester) async {
        await mockNetworkImagesFor(() async {
          final product = _makeProduct(id: 'p-1', name: 'Battery 12V');

          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [product],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Add 1 unit
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          expect(find.textContaining('1 item'), findsAtLeast(1));

          // Remove by decrementing to 0
          ProviderScope.containerOf(
                  tester.element(find.byType(CreateOrderFlow)))
              .read(cartProvider.notifier)
              .setQty(product, 0);
          await tester.pumpAndSettle();

          // Cart should be empty — no badge
          expect(find.textContaining('item'), findsNothing);
        });
      });

      testWidgets(
          'cart bar is absent initially (no items), appears when items added',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct()],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // No cart bar initially
          expect(find.text('Review & checkout'), findsNothing);

          // Add an item
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          // Cart bar now appears in collapsed state
          expect(find.text('Review & checkout'), findsOneWidget);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------

    group('search', () {
      testWidgets('empty search shows all products', (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [
                      _makeProduct(id: 'p-1', name: 'Battery 12V', sku: 'B12'),
                      _makeProduct(
                          id: 'p-2', name: 'Inverter 1kVA', sku: 'INV-1K'),
                    ],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          expect(find.text('Battery 12V'), findsOneWidget);
          expect(find.text('Inverter 1kVA'), findsOneWidget);
        });
      });

      testWidgets('search filters by product title (case-insensitive)',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [
                      _makeProduct(id: 'p-1', name: 'Battery 12V', sku: 'B12'),
                      _makeProduct(
                          id: 'p-2', name: 'Inverter 1kVA', sku: 'INV-1K'),
                    ],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Type lowercase 'battery' to match 'Battery 12V'
          await tester.enterText(find.byType(TextField).first, 'battery');
          await tester.pump();

          expect(find.text('Battery 12V'), findsOneWidget);
          expect(find.text('Inverter 1kVA'), findsNothing);
        });
      });

      testWidgets('search filters by SKU (case-insensitive)', (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [
                      _makeProduct(
                          id: 'p-1', name: 'Battery 12V', sku: 'SKU-BATT'),
                      _makeProduct(
                          id: 'p-2', name: 'Inverter 1kVA', sku: 'SKU-INV'),
                    ],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          await tester.enterText(find.byType(TextField).first, 'sku-inv');
          await tester.pump();

          expect(find.text('Inverter 1kVA'), findsOneWidget);
          expect(find.text('Battery 12V'), findsNothing);
        });
      });

      testWidgets('search is client-side — no additional API call on keystroke',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct()],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Type several characters
          await tester.enterText(find.byType(TextField).first, 'bat');
          await tester.pump();
          await tester.enterText(find.byType(TextField).first, 'batt');
          await tester.pump();

          // listProducts should have been called only once (on mount)
          verify(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .called(1);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    group('validation', () {
      testWidgets(
          'submitting with empty cart is a silent no-op (no error snackbar)',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer(
                  (_) async => PagedProducts(items: [], nextCursor: null));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // There should be no "Place order" button visible (cart is empty, bar hidden).
          // The spec says it's a silent no-op when cart is empty — no button to press.
          // We verify the orders client was never called.
          verifyNever(() => ordersClient.create(any()));
          expect(find.byType(SnackBar), findsNothing);
        });
      });

      testWidgets(
          'submitting with items but empty address shows snackbar error',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct()],
                    nextCursor: null,
                  ));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Add a product to cart
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          // Navigate to checkout.
          await tester.tap(find.text('Review & checkout'));
          await tester.pumpAndSettle();

          // Leave address empty and tap "Place order"
          await tester.tap(find.textContaining('Place order'));
          await tester.pumpAndSettle();

          expect(find.text('Please enter a delivery address'), findsOneWidget);
          verifyNever(() => ordersClient.create(any()));
        });
      });

      testWidgets(
          'submitting with items and address calls the create order API',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct(id: 'p-1', basePrice: '1500')],
                    nextCursor: null,
                  ));
          when(() => ordersClient.create(any()))
              .thenAnswer((_) async => _makeCreatedOrder());

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Add product
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          // Navigate to checkout.
          await tester.tap(find.text('Review & checkout'));
          await tester.pumpAndSettle();

          // Enter address
          await tester.enterText(
            find.byType(TextField).first,
            '42 Elm Street, Mumbai',
          );
          await tester.pumpAndSettle();

          // Tap place order
          await tester.tap(find.textContaining('Place order'));
          await tester.pumpAndSettle();

          verify(() => ordersClient.create(any())).called(1);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Success flow
    // -----------------------------------------------------------------------

    group('success flow', () {
      testWidgets(
          'on successful order creation: navigates to order detail route',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct(id: 'p-1', basePrice: '1500')],
                    nextCursor: null,
                  ));
          when(() => ordersClient.create(any()))
              .thenAnswer((_) async => _makeCreatedOrder(id: 'new-order-99'));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Add product
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          // Navigate to checkout and fill address.
          await tester.tap(find.text('Review & checkout'));
          await tester.pumpAndSettle();

          await tester.enterText(
            find.byType(TextField).first,
            '1 Success Lane',
          );
          await tester.pumpAndSettle();

          await tester.tap(find.textContaining('Place order'));
          await tester.pumpAndSettle();

          // After success, checkout is popped and the order detail route is pushed.
          expect(find.text('Order:new-order-99'), findsOneWidget);
        });
      });
    });

    // -----------------------------------------------------------------------
    // Error flow
    // -----------------------------------------------------------------------

    group('error flow', () {
      testWidgets('on API failure: snackbar shown and screen stays on checkout',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct()],
                    nextCursor: null,
                  ));
          when(() => ordersClient.create(any()))
              .thenThrow(Exception('Server error'));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          // Add product
          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();

          // Navigate to checkout and fill address.
          await tester.tap(find.text('Review & checkout'));
          await tester.pumpAndSettle();

          await tester.enterText(
            find.byType(TextField).first,
            '42 Error Street',
          );
          await tester.pumpAndSettle();

          await tester.tap(find.textContaining('Place order'));
          await tester.pumpAndSettle();

          // Snackbar with failure message must appear
          expect(find.textContaining('Failed to place order'), findsOneWidget);

          // Screen should still be showing checkout.
          expect(find.text('Checkout'), findsOneWidget);
        });
      });

      testWidgets('on API failure: snackbar has red background',
          (tester) async {
        await mockNetworkImagesFor(() async {
          when(() => catalogClient.listProducts(limit: any(named: 'limit')))
              .thenAnswer((_) async => PagedProducts(
                    items: [_makeProduct()],
                    nextCursor: null,
                  ));
          when(() => ordersClient.create(any()))
              .thenThrow(Exception('Server error'));

          await tester.pumpWidget(_buildFlow(
            catalogClient: catalogClient,
            ordersClient: ordersClient,
          ));
          await tester.pumpAndSettle();

          await tester.tap(find.byIcon(Icons.add).first);
          await tester.pumpAndSettle();
          await tester.tap(find.text('Review & checkout'));
          await tester.pumpAndSettle();
          await tester.enterText(
            find.byType(TextField).first,
            '1 Error Ave',
          );
          await tester.pumpAndSettle();
          await tester.tap(find.textContaining('Place order'));
          await tester.pumpAndSettle();

          // Find SnackBar and check its background color
          final snackBar = tester.widget<SnackBar>(find.byType(SnackBar));
          expect(snackBar.backgroundColor, equals(Colors.red));
        });
      });
    });
  });
}
