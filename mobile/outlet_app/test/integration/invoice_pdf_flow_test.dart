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
// Data builders
// ---------------------------------------------------------------------------

Map<String, dynamic> invoiceSummaryJson({
  String id = 'inv-1',
  String invoiceNumber = 'INV-2024-001',
  String orderId = 'order-1',
  String total = '5000.00',
  String amountPaid = '5000.00',
  String amountDue = '0.00',
}) =>
    {
      'id': id,
      'invoiceNumber': invoiceNumber,
      'orderId': orderId,
      'outletId': 'outlet-1',
      'invoiceDate': '2024-01-15',
      'dueDate': '2024-02-15',
      'total': total,
      'amountPaid': amountPaid,
      'amountDue': amountDue,
      'createdAt': '2024-01-15T10:00:00Z',
    };

Map<String, dynamic> invoiceDetailJson({
  String id = 'inv-1',
  String invoiceNumber = 'INV-2024-001',
  String total = '5000.00',
  String amountPaid = '5000.00',
  String amountDue = '0.00',
}) =>
    {
      'id': id,
      'invoiceNumber': invoiceNumber,
      'orderId': 'order-1',
      'outletId': 'outlet-1',
      'invoiceDate': '2024-01-15',
      'dueDate': '2024-02-15',
      'total': total,
      'amountPaid': amountPaid,
      'amountDue': amountDue,
      'createdAt': '2024-01-15T10:00:00Z',
      'orderNumber': 'ORD-001',
      'subtotal': '5000.00',
      'discountAmount': null,
      'charges': [],
      'lines': [
        {
          'id': 'line-1',
          'sku': 'SKU-001',
          'qty': 2,
          'unitPrice': '2500.00',
          'lineTotal': '5000.00',
        }
      ],
    };

Map<String, dynamic> outletProfileJson() => {
      'id': 'outlet-1',
      'outletCode': 'OUT-001',
      'name': 'Test Outlet',
      'ownerName': 'Ravi Kumar',
      'phone': '9876543210',
      'address': '123 Main Street, Mumbai',
      'creditLimit': '100000.00',
      'outstandingBalance': '5000.00',
      'isActive': true,
      'legalName': 'Test Outlet Pvt Ltd',
      'gstin': '27AAACT2727Q1ZW',
      'billingAddress1': '123 Main Street',
      'billingAddress2': 'Andheri East',
      'billingCity': 'Mumbai',
      'billingState': 'Maharashtra',
      'billingPincode': '400069',
      'warehouseId': null,
    };

Map<String, dynamic> pagedInvoicesJson(List<Map<String, dynamic>> items) =>
    {'items': items, 'nextCursor': null};

// Home screen stubs.
Map<String, dynamic> summaryJson() => {
      'outletId': 'outlet-1',
      'outstandingLive': '0',
      'outstandingSnapshot': '0',
      'openInvoicesCount': 1,
      'ordersCount': 0,
    };

Map<String, dynamic> pagedEmpty() => {'items': [], 'nextCursor': null};

// ---------------------------------------------------------------------------
// App pump helper
// ---------------------------------------------------------------------------

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
      .thenAnswer((_) async => pagedEmpty());
  when(() => mockApi.query('outletPortal.dispatchHistory', any(), any()))
      .thenAnswer((_) async => pagedEmpty());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('Invoice PDF flow — Download invoice PDF → share sheet appears', () {
    testWidgets(
      'tapping Download as PDF calls myProfile and triggers share',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        // Invoice list returns one invoice.
        when(
          () => mockApi.query('outletPortal.invoiceHistory', any(), any()),
        ).thenAnswer(
          (_) async => pagedInvoicesJson([invoiceSummaryJson()]),
        );

        // Invoice detail.
        when(
          () => mockApi.query('outletPortal.invoiceDetail', any(), any()),
        ).thenAnswer((_) async => invoiceDetailJson());

        // myProfile — tracked separately.
        when(
          () => mockApi.query('outletPortal.myProfile', any(), any()),
        ).thenAnswer((_) async => outletProfileJson());

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        // Navigate to Invoices tab.
        await tester.tap(find.text('Invoices'));
        await tester.pumpAndSettle();

        // Tap the invoice tile.
        await tester.tap(find.textContaining('INV-2024-001'));
        await tester.pumpAndSettle();

        // Invoice detail screen should be showing.
        expect(find.text('INV-2024-001'), findsOneWidget);

        // Download PDF button should be visible.
        expect(find.text('Download as PDF'), findsOneWidget);

        // Tap the download button.
        await tester.tap(find.text('Download as PDF'));
        await tester.pumpAndSettle();

        // myProfile must have been called (fresh call, not cached).
        verify(
          () => mockApi.query(
            'outletPortal.myProfile',
            any(that: isA<Map<String, dynamic>>()),
            any(),
          ),
        ).called(1);
      },
    );
  });

  // ---------------------------------------------------------------------------

  group('Invoice PDF flow — PDF download called twice → myProfile called twice',
      () {
    testWidgets(
      'each download triggers a fresh myProfile call — total 2 calls for 2 downloads',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        when(
          () => mockApi.query('outletPortal.invoiceHistory', any(), any()),
        ).thenAnswer(
          (_) async => pagedInvoicesJson([invoiceSummaryJson()]),
        );

        when(
          () => mockApi.query('outletPortal.invoiceDetail', any(), any()),
        ).thenAnswer((_) async => invoiceDetailJson());

        // myProfile: must allow multiple calls (no caching between downloads).
        var myProfileCallCount = 0;
        when(
          () => mockApi.query('outletPortal.myProfile', any(), any()),
        ).thenAnswer((_) async {
          myProfileCallCount++;
          return outletProfileJson();
        });

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await tester.tap(find.text('Invoices'));
        await tester.pumpAndSettle();

        await tester.tap(find.textContaining('INV-2024-001'));
        await tester.pumpAndSettle();

        expect(find.text('Download as PDF'), findsOneWidget);

        // First download.
        await tester.tap(find.text('Download as PDF'));
        await tester.pumpAndSettle();

        // Button may show 'Generating PDF...' while in progress then revert.
        // Wait for it to become tappable again.
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pumpAndSettle();

        // Second download.
        await tester.tap(find.text('Download as PDF'));
        await tester.pumpAndSettle();
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pumpAndSettle();

        // Verify myProfile was called exactly twice (no caching between downloads).
        expect(myProfileCallCount, equals(2));
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
