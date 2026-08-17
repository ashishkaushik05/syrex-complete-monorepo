// ignore_for_file: lines_longer_than_80_chars

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/app/app.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/api/api_client.dart';
import 'package:outlet_app/core/models/session.dart';

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

class MockApiClient extends Mock implements ApiClient {}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

Map<String, dynamic> productJson({
  String id = 'prod-1',
  String sku = 'SKU-001',
  String displayTitle = 'Test Battery 12V',
  String basePrice = '1500.00',
}) =>
    {
      'id': id,
      'sku': sku,
      'displayTitle': displayTitle,
      'basePrice': basePrice,
    };

Map<String, dynamic> pagedProductsJson(List<Map<String, dynamic>> items) =>
    {'items': items, 'nextCursor': null};

Map<String, dynamic> orderJson({
  String id = 'order-1',
  String orderNumber = 'ORD-0001',
  String outletId = 'outlet-1',
  String status = 'pending_approval',
  String totalValue = '1500.00',
  String subtotalValue = '1500.00',
  String taxTotal = '0.00',
  List<Map<String, dynamic>>? lines,
}) =>
    {
      'id': id,
      'orderNumber': orderNumber,
      'outletId': outletId,
      'status': status,
      'priority': 'medium',
      'orderDate': '2026-06-06',
      'deliveryAddress': '123 Test Street, Mumbai',
      'totalValue': totalValue,
      'subtotalValue': subtotalValue,
      'taxTotal': taxTotal,
      'notes': null,
      'approvedAt': null,
      'rejectionReason': null,
      'lines': lines ?? [
        {
          'id': 'line-1',
          'productId': 'prod-1',
          'sku': 'SKU-001',
          'qtyOrdered': 1,
          'qtyDispatched': 0,
          'unitPrice': '1500.00',
          'lineTotal': '1500.00',
          'status': 'pending',
        }
      ],
    };

Map<String, dynamic> pagedOrdersEmpty() => {'items': [], 'nextCursor': null};
Map<String, dynamic> pagedDispatchesEmpty() => {
      'items': [],
      'nextCursor': null,
    };
Map<String, dynamic> pagedInvoicesEmpty() => {'items': [], 'nextCursor': null};
Map<String, dynamic> summaryJson() => {
      'outletId': 'outlet-1',
      'outstandingLive': '0',
      'outstandingSnapshot': '0',
      'openInvoicesCount': 0,
      'ordersCount': 1,
    };

// ---------------------------------------------------------------------------
// App pump helpers
// ---------------------------------------------------------------------------

/// Pump the full app starting in the authenticated state.
Future<void> pumpAuthenticatedApp(
  WidgetTester tester,
  MockApiClient mockApi,
) async {
  await mockNetworkImagesFor(() async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(mockApi),
          sessionControllerProvider.overrideWith(
            () => _AuthenticatedController(),
          ),
        ],
        child: const OutletApp(),
      ),
    );
  });
}

void stubHomeQueries(MockApiClient mockApi) {
  when(() => mockApi.query('outletPortal.summary', any(), any()))
      .thenAnswer((_) async => summaryJson());
  when(() => mockApi.query('outletPortal.orderHistory', any(), any()))
      .thenAnswer((_) async => pagedOrdersEmpty());
  when(() => mockApi.query('outletPortal.dispatchHistory', any(), any()))
      .thenAnswer((_) async => pagedDispatchesEmpty());
  when(() => mockApi.query('outletPortal.invoiceHistory', any(), any()))
      .thenAnswer((_) async => pagedInvoicesEmpty());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('Order creation flow — Create order → success → order in list', () {
    testWidgets(
      'happy path: add product, fill address, place order, land on detail',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        // Catalog: one product available.
        when(() => mockApi.query('products.list', any(), any()))
            .thenAnswer((_) async => pagedProductsJson([productJson()]));

        // orders.create returns a new order.
        when(() => mockApi.mutation('orders.create', any(), any()))
            .thenAnswer((_) async => orderJson());

        // orderDetail called after navigation to /orders/order-1.
        when(() => mockApi.query('outletPortal.orderDetail', any(), any()))
            .thenAnswer((_) async => orderJson());

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        // Navigate to Orders tab.
        await tester.tap(find.text('Orders'));
        await tester.pumpAndSettle();

        // Tap the FAB ('New order').
        await tester.tap(find.text('New order'));
        await tester.pumpAndSettle();

        // Catalog products are loaded and displayed.
        expect(find.text('Test Battery 12V'), findsOneWidget);

        // Add product to cart by tapping the increment button in the
        // QtyStepper.  The stepper's "+" button increments quantity.
        // We look for the add icon inside the Create Order screen.
        final addButtons = find.byIcon(Icons.add);
        expect(addButtons, findsWidgets);
        await tester.tap(addButtons.first);
        await tester.pumpAndSettle();

        // Cart bar should appear (item count > 0).
        expect(find.text('1 item'), findsOneWidget);

        // Tap "Review order" to expand the cart bar.
        await tester.tap(find.text('Review order'));
        await tester.pumpAndSettle();

        // Fill delivery address.
        final addressField = find.byWidgetPredicate(
          (w) =>
              w is TextField &&
              (w.decoration?.hintText?.contains('delivery') ?? false),
        );
        if (addressField.evaluate().isNotEmpty) {
          await tester.enterText(addressField, '123 Test Street, Mumbai');
        } else {
          // Fall back to finding by hint text substring in the expanded cart.
          await tester.enterText(
            find.byWidgetPredicate(
              (w) =>
                  w is TextField &&
                  (w.decoration?.hintText == 'Full delivery address'),
            ),
            '123 Test Street, Mumbai',
          );
        }
        await tester.pumpAndSettle();

        // Tap "Place order".
        await tester.tap(
          find.textContaining('Place order'),
          warnIfMissed: false,
        );
        await tester.pumpAndSettle();

        // Verify orders.create was called with correct payload shape.
        verify(
          () => mockApi.mutation(
            'orders.create',
            any(that: isA<Map<String, dynamic>>()
                  .having((m) => m['outletId'], 'outletId', 'outlet-1')
                  .having((m) => (m['lines'] as List).isNotEmpty, 'lines non-empty', true)),
            any(),
          ),
        ).called(1);

        // After success, should be on Order Detail screen.
        // The order detail screen title includes the order number.
        expect(find.textContaining('ORD-0001'), findsOneWidget);
      },
    );
  });

  // ---------------------------------------------------------------------------

  group('Order creation flow — Empty cart → silent no-op', () {
    testWidgets(
      'tapping Place Order with empty cart makes no API call',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        when(() => mockApi.query('products.list', any(), any()))
            .thenAnswer((_) async => pagedProductsJson([productJson()]));

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await tester.tap(find.text('Orders'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('New order'));
        await tester.pumpAndSettle();

        // Cart bar is NOT shown (cart is empty).
        expect(find.text('Review order'), findsNothing);

        // There is no "Place order" button visible when cart is collapsed.
        // Attempting to find it should fail.
        expect(find.textContaining('Place order'), findsNothing);

        // orders.create must NOT have been called.
        verifyNever(
          () => mockApi.mutation('orders.create', any(), any()),
        );

        // Screen remains on Create Order (New order app bar title visible).
        expect(find.text('New order'), findsOneWidget);
      },
    );
  });

  // ---------------------------------------------------------------------------

  group('Order creation flow — Missing address → snackbar error', () {
    testWidgets(
      'shows snackbar and makes no API call when address is empty',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        when(() => mockApi.query('products.list', any(), any()))
            .thenAnswer((_) async => pagedProductsJson([productJson()]));

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await tester.tap(find.text('Orders'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('New order'));
        await tester.pumpAndSettle();

        // Add product to cart.
        final addButtons = find.byIcon(Icons.add);
        await tester.tap(addButtons.first);
        await tester.pumpAndSettle();

        // Expand cart bar without filling address.
        await tester.tap(find.text('Review order'));
        await tester.pumpAndSettle();

        // Do NOT fill delivery address — leave it empty.

        // Tap Place order.
        await tester.tap(
          find.textContaining('Place order'),
          warnIfMissed: false,
        );
        await tester.pumpAndSettle();

        // Snackbar with address error should be shown.
        expect(
          find.text('Please enter a delivery address'),
          findsOneWidget,
        );

        // orders.create must NOT have been called.
        verifyNever(
          () => mockApi.mutation('orders.create', any(), any()),
        );
      },
    );
  });

  // ---------------------------------------------------------------------------

  group('Order creation flow — Cancel order → status updates', () {
    testWidgets(
      'cancel order: dialog appears, outletPortal.cancel is called, detail refreshes',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        // orderHistory for the list screen.
        when(() => mockApi.query('outletPortal.orderHistory', any(), any()))
            .thenAnswer(
          (_) async => {
            'items': [orderJson(status: 'pending_approval')],
            'nextCursor': null,
          },
        );

        // orderDetail: initially pending_approval, then after cancel returns
        // cancelled.
        var callCount = 0;
        when(() => mockApi.query('outletPortal.orderDetail', any(), any()))
            .thenAnswer((_) async {
          callCount++;
          return callCount == 1
              ? orderJson(status: 'pending_approval')
              : orderJson(status: 'cancelled');
        });

        // outletPortal.cancel void mutation.
        when(() => mockApi.mutationVoid('outletPortal.cancel', any()))
            .thenAnswer((_) async {});

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        // Navigate to Orders tab.
        await tester.tap(find.text('Orders'));
        await tester.pumpAndSettle();

        // Tap the order tile to open detail.
        await tester.tap(find.textContaining('ORD-0001'));
        await tester.pumpAndSettle();

        // Cancel button is visible for pending_approval orders.
        expect(find.text('Cancel order'), findsOneWidget);

        // Tap Cancel order button.
        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        // Confirmation dialog appears.
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(find.text('Cancel order?'), findsOneWidget);
        expect(find.text('This action cannot be undone.'), findsOneWidget);

        // Tap the "Cancel order" action in the dialog (confirm cancellation).
        final dialogCancelButtons = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Cancel order'),
        );
        await tester.tap(dialogCancelButtons.last);
        await tester.pumpAndSettle();

        // Verify outletPortal.cancel was called (NOT orders.transition).
        verify(
          () => mockApi.mutationVoid(
            'outletPortal.cancel',
            any(that: isA<Map<String, dynamic>>()
                  .having((m) => m['outletId'], 'outletId', 'outlet-1')
                  .having((m) => m['orderId'], 'orderId', 'order-1')),
          ),
        ).called(1);

        verifyNever(
          () => mockApi.mutation('orders.transition', any(), any()),
        );

        // Detail screen should have refreshed — cancelled status visible.
        expect(find.text('cancelled'), findsOneWidget);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Fake authenticated SessionController
// ---------------------------------------------------------------------------

class _AuthenticatedController extends SessionController {
  @override
  SessionState build() {
    return SessionState(
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
      orgId: 'org-1',
      user: SessionUser(
        id: 'user-1',
        email: 'outlet@syrex.local',
        name: 'Test Outlet',
        userType: 'outlet',
        outletId: 'outlet-1',
        permissions: [],
      ),
    );
  }

  @override
  Future<void> restoreSession() async {}
}
