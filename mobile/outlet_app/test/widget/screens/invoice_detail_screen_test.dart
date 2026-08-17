import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/core/api/outlet_portal_client.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/invoice.dart';
import 'package:outlet_app/core/models/outlet.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/app/theme_provider.dart';
import 'package:outlet_app/modules/invoices/invoice_detail_screen.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockOutletPortalClient extends Mock implements OutletPortalClient {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

final _testSession = SessionState(
  accessToken: 'tok',
  user: SessionUser(
    id: 'user-1',
    email: 'test@syrex.local',
    name: 'Test User',
    userType: 'outlet',
    outletId: 'outlet-abc',
    permissions: ['*'],
  ),
);

InvoiceDetailDto _detail({
  String id = 'inv-detail-001',
  String invoiceNumber = 'INV-2024-001',
  String amountDue = '0',
  String amountPaid = '5000',
  String total = '5000',
  String? dueDate,
  String? invoiceDate = '2024-01-15',
  String? subtotal,
  String? discountAmount,
  List<InvoiceCharge> charges = const [],
  List<InvoiceLine> lines = const [],
  String orderNumber = 'ORD-001',
}) =>
    InvoiceDetailDto(
      id: id,
      invoiceNumber: invoiceNumber,
      orderId: 'ord-001',
      outletId: 'outlet-abc',
      invoiceDate: invoiceDate,
      dueDate: dueDate,
      total: total,
      amountPaid: amountPaid,
      amountDue: amountDue,
      orderNumber: orderNumber,
      subtotal: subtotal,
      discountAmount: discountAmount,
      charges: charges,
      lines: lines,
    );

Widget _buildApp(
  List<Override> overrides, {
  String invoiceId = 'inv-detail-001',
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      home: InvoiceDetailScreen(invoiceId: invoiceId),
    ),
  );
}

List<Override> _makeOverrides(MockOutletPortalClient client) {
  return [
    sessionControllerProvider.overrideWith(
        () => _FakeSessionController(_testSession)),
    themeModeProvider.overrideWith((ref) => ThemeMode.light),
    outletPortalClientProvider.overrideWithValue(client),
  ];
}

void main() {
  late MockOutletPortalClient mockClient;

  setUp(() {
    mockClient = MockOutletPortalClient();
  });

  // ---------------------------------------------------------------------------
  group('InvoiceDetailScreen — Loading state', () {
    testWidgets('renders skeleton while provider is loading', (tester) async {
      final completer = Completer<InvoiceDetailDto>();
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) => completer.future);

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();

        // 5 skeleton rows (height 52) in a ListView during loading.
        final containers = tester.widgetList<Container>(find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Container),
        ));
        expect(containers.length, greaterThanOrEqualTo(5));
        // No INVOICE subtitle in loading state.
        expect(find.text('INVOICE'), findsNothing);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('InvoiceDetailScreen — Error state', () {
    testWidgets('shows "Failed to load invoice" on error', (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenThrow(Exception('network error'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();
        await tester.pump();

        expect(find.text('Failed to load invoice'), findsOneWidget);
      });
    });

    testWidgets('error state has no retry button', (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenThrow(Exception('network error'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();
        await tester.pump();

        expect(find.byType(ElevatedButton), findsNothing);
        expect(find.byType(TextButton), findsNothing);
        expect(find.byType(OutlinedButton), findsNothing);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('InvoiceDetailScreen — Data state rendering', () {
    testWidgets('renders invoice number and INVOICE subtitle in app bar',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(invoiceNumber: 'INV-2024-042'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('INV-2024-042'), findsOneWidget);
        expect(find.text('INVOICE'), findsOneWidget);
      });
    });

    testWidgets('renders order row with # prefix', (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(orderNumber: 'ORD-007'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('#ORD-007'), findsOneWidget);
      });
    });

    testWidgets('renders financial summary rows: Total, Paid, Balance due',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(
                total: '10000',
                amountPaid: '10000',
                amountDue: '0',
              ));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Balance due'), findsOneWidget);
        expect(find.text('Paid'), findsOneWidget);
        expect(find.text('Total'), findsOneWidget);
      });
    });

    testWidgets('renders line items section when lines are non-empty',
        (tester) async {
      final lines = [
        InvoiceLine(
          id: 'line-001',
          sku: 'SKU-ABC',
          qty: 2,
          unitPrice: '500',
          lineTotal: '1000',
        ),
      ];
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(lines: lines));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Line items'), findsOneWidget);
        expect(find.textContaining('SKU-ABC'), findsOneWidget);
      });
    });

    testWidgets('hides line items section when lines are empty',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(lines: []));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Line items'), findsNothing);
      });
    });

    testWidgets('renders subtotal row when subtotal is non-null',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(subtotal: '8000'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Subtotal'), findsOneWidget);
      });
    });

    testWidgets('hides subtotal row when subtotal is null', (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(subtotal: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Subtotal'), findsNothing);
      });
    });

    testWidgets('renders charge rows when charges are present',
        (tester) async {
      final charges = [
        InvoiceCharge(
          id: 'chg-001',
          name: 'GST 18%',
          type: 'tax',
          rate: '18',
          amount: '1440',
          displayOrder: 0,
        ),
      ];
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(charges: charges));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('GST 18%'), findsOneWidget);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('InvoiceDetailScreen — Discount row inconsistency (critical)', () {
    // Spec: Screen RENDERS discount row when discountAmount != null even if zero.
    // PDF behavior differs (PDF omits zero-discount) but is tested separately.

    testWidgets(
        'renders discount row when discountAmount is non-null and zero',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(discountAmount: '0'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // Screen shows discount row even when the amount is zero.
        expect(find.text('Discount'), findsOneWidget);
      });
    });

    testWidgets('hides discount row when discountAmount is null',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(discountAmount: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Discount'), findsNothing);
      });
    });

    testWidgets(
        'renders discount row when discountAmount is non-null and non-zero',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(discountAmount: '500'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Discount'), findsOneWidget);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('InvoiceDetailScreen — PDF download flow', () {
    testWidgets('download button is always present in data state',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail());

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Download as PDF'), findsOneWidget);
      });
    });

    testWidgets('tapping download calls myProfile each time (no caching)',
        (tester) async {
      var profileCallCount = 0;

      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail());
      when(() => mockClient.myProfile()).thenAnswer((_) async {
        profileCallCount++;
        throw Exception('pdf-test-stop');
      });

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // First tap.
        await tester.tap(find.text('Download as PDF'));
        await tester.pumpAndSettle();

        expect(profileCallCount, equals(1));

        // Button should be back to normal after error.
        expect(find.text('Download as PDF'), findsOneWidget);

        // Second tap — myProfile called again (not cached).
        await tester.tap(find.text('Download as PDF'));
        await tester.pumpAndSettle();

        expect(profileCallCount, equals(2));
      });
    });

    testWidgets('button shows loading spinner while download is in progress',
        (tester) async {
      final completer = Completer<OutletProfileDto>();

      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail());
      when(() => mockClient.myProfile())
          .thenAnswer((_) => completer.future);

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Download as PDF'));
        await tester.pump(); // start async, do not settle

        // AppButton.loading = true shows CircularProgressIndicator (not label text).
        expect(find.byType(CircularProgressIndicator), findsAtLeast(1));
        // 'Download as PDF' text is hidden while loading.
        expect(find.text('Download as PDF'), findsNothing);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('InvoiceDetailScreen — Overdue banner', () {
    testWidgets('shows overdue banner for past-due invoice with balance',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(
                amountDue: '2000',
                dueDate: '2020-01-01',
              ));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('Payment overdue'), findsOneWidget);
      });
    });

    testWidgets(
        'no overdue banner when amountDue is 0 even with past dueDate',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(
                amountDue: '0',
                amountPaid: '5000',
                dueDate: '2020-01-01',
              ));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('Payment overdue'), findsNothing);
      });
    });

    testWidgets('no overdue banner when dueDate is in the future',
        (tester) async {
      when(() => mockClient.invoiceDetail(any(), any()))
          .thenAnswer((_) async => _detail(
                amountDue: '1000',
                dueDate: '2099-12-31',
              ));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('Payment overdue'), findsNothing);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Fake session controller
// ---------------------------------------------------------------------------

class _FakeSessionController extends SessionController {
  final SessionState _state;
  _FakeSessionController(this._state);

  @override
  SessionState build() => _state;
}
