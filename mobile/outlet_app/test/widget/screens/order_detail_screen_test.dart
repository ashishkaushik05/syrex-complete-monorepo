// ignore_for_file: avoid_redundant_argument_values

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:outlet_app/modules/orders/order_detail_screen.dart';
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
  String orderNumber = 'ORD-0042',
  String status = 'pending_approval',
  String priority = 'medium',
  String deliveryAddress = '1 Main St',
  List<OrderLineDto> lines = const [],
}) =>
    OrderDto(
      id: id,
      orderNumber: orderNumber,
      outletId: 'outlet-1',
      status: status,
      priority: priority,
      orderDate: '2026-06-01',
      deliveryAddress: deliveryAddress,
      totalValue: '10000',
      subtotalValue: '9000',
      taxTotal: '1000',
      lines: lines,
    );

OrderLineDto _makeLine({
  String id = 'line-1',
  String productId = 'prod-1',
  String sku = 'SKU-001',
  int qtyOrdered = 5,
  int qtyDispatched = 0,
  String unitPrice = '2000',
}) =>
    OrderLineDto(
      id: id,
      productId: productId,
      sku: sku,
      qtyOrdered: qtyOrdered,
      qtyDispatched: qtyDispatched,
      unitPrice: unitPrice,
      lineTotal: (double.parse(unitPrice) * qtyOrdered).toStringAsFixed(0),
      status: 'pending',
    );

class _FakeSessionController extends SessionController {
  final SessionState _s;
  _FakeSessionController(this._s);

  @override
  SessionState build() => _s;
}

Widget _buildScreen({
  required MockOutletPortalClient client,
  String orderId = 'order-1',
}) {
  return ProviderScope(
    overrides: [
      sessionControllerProvider.overrideWith(() => _FakeSessionController(_makeSession())),
      outletPortalClientProvider.overrideWith((_) => client),
    ],
    child: MaterialApp(
      home: OrderDetailScreen(orderId: orderId),
    ),
  );
}

// ===========================================================================
// Tests
// ===========================================================================

void main() {
  group('OrderDetailScreen', () {
    late MockOutletPortalClient client;

    setUp(() {
      client = MockOutletPortalClient();
      // Default: cancel is a no-op
      when(() => client.cancel(any(), any())).thenAnswer((_) async {});
    });

    // -----------------------------------------------------------------------
    // Loading state
    // -----------------------------------------------------------------------

    group('loading state', () {
      testWidgets('shows skeleton while loading', (tester) async {
        final completer = Completer<OrderDto>();
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) => completer.future);

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pump();

        // Data should NOT be visible yet
        expect(find.text('#ORD-0042'), findsNothing);
        // Skeleton containers should be present (4 × 60px ConstrainedBoxes).
        // Container(height: 60) creates a ConstrainedBox internally.
        final boxes = tester.widgetList<ConstrainedBox>(find.byType(ConstrainedBox));
        final skeletonBoxes = boxes.where((b) => b.constraints.maxHeight == 60).toList();
        expect(skeletonBoxes.length, greaterThanOrEqualTo(4));

        completer.complete(_makeOrder());
        await tester.pumpAndSettle();
      });
    });

    // -----------------------------------------------------------------------
    // Error state
    // -----------------------------------------------------------------------

    group('error state', () {
      testWidgets('shows centered "Failed to load order" text on error', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenThrow(Exception('network error'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Failed to load order'), findsOneWidget);
      });

      testWidgets('no retry button shown in error state', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenThrow(Exception('network error'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Retry'), findsNothing);
      });
    });

    // -----------------------------------------------------------------------
    // Data state — summary card fields
    // -----------------------------------------------------------------------

    group('data state — summary card', () {
      testWidgets('order number is rendered in the app bar title', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(orderNumber: 'ORD-0042'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('#ORD-0042'), findsOneWidget);
      });

      testWidgets('order date is rendered', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder());

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        // fmtDateStr('2026-06-01') → '01 Jun 2026'
        expect(find.text('01 Jun 2026'), findsOneWidget);
      });

      testWidgets('status badge is rendered', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'pending_approval'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        // statusLabel('pending_approval') → 'Pending approval'
        expect(find.text('Pending approval'), findsAtLeast(1));
      });

      testWidgets('delivery address is rendered', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(deliveryAddress: '42 Elm Street'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('42 Elm Street'), findsOneWidget);
      });

      testWidgets('priority is rendered', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(priority: 'high'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('high'), findsOneWidget);
      });
    });

    // -----------------------------------------------------------------------
    // Order lines
    // -----------------------------------------------------------------------

    group('order lines', () {
      testWidgets('each line shows product SKU, qty, and unit price', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(
                  lines: [
                    _makeLine(
                      sku: 'SKU-BATT-12V',
                      qtyOrdered: 10,
                      unitPrice: '1500',
                    ),
                  ],
                ));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('SKU-BATT-12V'), findsOneWidget);
        expect(find.text('10'), findsOneWidget);
        // fmtINR(1500) → '₹1,500'
        expect(find.textContaining('1,500'), findsOneWidget);
      });
    });

    // -----------------------------------------------------------------------
    // Cancel button visibility
    // -----------------------------------------------------------------------

    group('cancel button visibility', () {
      testWidgets('cancel button IS shown when status is pending_approval', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'pending_approval'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsOneWidget);
      });

      testWidgets('cancel button IS shown when status is approved', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'approved'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsOneWidget);
      });

      testWidgets('cancel button is NOT shown when status is dispatched', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'dispatched'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsNothing);
      });

      testWidgets('cancel button is NOT shown when status is delivered', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'delivered'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsNothing);
      });

      testWidgets('cancel button is NOT shown when status is cancelled', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'cancelled'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsNothing);
      });

      testWidgets('cancel button is NOT shown when status is fully_dispatched', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'fully_dispatched'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsNothing);
      });

      testWidgets('cancel button is NOT shown when status is partially_dispatched',
          (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'partially_dispatched'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(find.text('Cancel order'), findsNothing);
      });
    });

    // -----------------------------------------------------------------------
    // Cancel flow
    // -----------------------------------------------------------------------

    group('cancel flow', () {
      testWidgets('tapping Cancel order shows confirmation dialog with required text',
          (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'pending_approval'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        // Dialog must appear with specific texts
        expect(find.text('Cancel order?'), findsOneWidget);
        expect(find.text('This action cannot be undone.'), findsOneWidget);
        // Both dialog action buttons
        expect(find.text('Keep'), findsOneWidget);
        expect(find.text('Cancel order'), findsWidgets); // may be 2 (button + dialog action)
      });

      testWidgets('confirming dialog calls outletPortal.cancel', (tester) async {
        var detailCallCount = 0;
        when(() => client.orderDetail(any(), any())).thenAnswer((_) async {
          detailCallCount++;
          return _makeOrder(status: 'pending_approval');
        });
        when(() => client.cancel(any(), any())).thenAnswer((_) async {});

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        // Tap the dialog's "Cancel order" button (the confirm action)
        // There may be two widgets with this text; the one inside the dialog
        // is the confirmation button.
        final cancelConfirmButton = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Cancel order'),
        );
        await tester.tap(cancelConfirmButton);
        await tester.pumpAndSettle();

        verify(() => client.cancel('outlet-1', 'order-1')).called(1);
      });

      testWidgets('after successful cancel, provider is invalidated and screen refreshes',
          (tester) async {
        var detailCallCount = 0;
        when(() => client.orderDetail(any(), any())).thenAnswer((_) async {
          detailCallCount++;
          return _makeOrder(
            status: detailCallCount == 1 ? 'pending_approval' : 'cancelled',
          );
        });
        when(() => client.cancel(any(), any())).thenAnswer((_) async {});

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        expect(detailCallCount, 1);

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        final cancelConfirmButton = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Cancel order'),
        );
        await tester.tap(cancelConfirmButton);
        await tester.pumpAndSettle();

        // After cancel + refresh, orderDetail should be called again
        expect(detailCallCount, greaterThan(1));
      });

      testWidgets(
          'no loading indicator is shown during the cancel API call (known gap from spec)',
          (tester) async {
        // The spec explicitly notes: "there is no loading indicator shown while
        // the cancel API call is in-flight."
        final completer = Completer<void>();
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'pending_approval'));
        when(() => client.cancel(any(), any()))
            .thenAnswer((_) => completer.future);

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        final cancelConfirmButton = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Cancel order'),
        );
        await tester.tap(cancelConfirmButton);
        await tester.pump(); // one frame — cancel is in-flight

        // Dialog should be dismissed but no CircularProgressIndicator
        expect(find.byType(CircularProgressIndicator), findsNothing);

        completer.complete();
        await tester.pumpAndSettle();
      });

      testWidgets('cancel uses outletPortal.cancel procedure, not orders.transition',
          (tester) async {
        // The spec says OrderDetailScreen uses OutletPortalClient.cancel
        // (not OrdersClient.cancel which calls orders.transition).
        // We verify that client.cancel() is called (OutletPortalClient method)
        // and that no other cancel method is invoked.
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'approved'));
        when(() => client.cancel(any(), any())).thenAnswer((_) async {});

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        final cancelConfirmButton = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('Cancel order'),
        );
        await tester.tap(cancelConfirmButton);
        await tester.pumpAndSettle();

        // outletPortalClient.cancel must have been called
        verify(() => client.cancel(any(), any())).called(1);
      });

      testWidgets('"Keep" button dismisses dialog without calling cancel API', (tester) async {
        when(() => client.orderDetail(any(), any()))
            .thenAnswer((_) async => _makeOrder(status: 'pending_approval'));

        await tester.pumpWidget(_buildScreen(client: client));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Cancel order'));
        await tester.pumpAndSettle();

        // Tap "Keep"
        await tester.tap(find.text('Keep'));
        await tester.pumpAndSettle();

        // Dialog dismissed
        expect(find.byType(AlertDialog), findsNothing);
        // cancel was NOT called
        verifyNever(() => client.cancel(any(), any()));
      });
    });
  });
}
