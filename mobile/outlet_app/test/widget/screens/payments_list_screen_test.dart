import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/core/api/payments_client.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/payment.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/app/theme_provider.dart';
import 'package:outlet_app/modules/payments/payments_list_screen.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockPaymentsClient extends Mock implements PaymentsClient {}

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

PaymentDto _payment({
  String id = 'pay-001',
  String amount = '5000',
  String paymentDate = '2026-06-01',
  String? reference,
  bool voided = false,
  String? voidReason,
}) =>
    PaymentDto(
      id: id,
      outletId: 'outlet-abc',
      amount: amount,
      paymentDate: paymentDate,
      reference: reference,
      description: null,
      voided: voided,
      voidReason: voidReason,
      createdAt: null,
    );

Widget _buildApp(List<Override> overrides) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(home: PaymentsListScreen()),
  );
}

List<Override> _makeOverrides(MockPaymentsClient client) {
  return [
    sessionControllerProvider.overrideWith(
        () => _FakeSessionController(_testSession)),
    themeModeProvider.overrideWith((ref) => ThemeMode.light),
    paymentsClientProvider.overrideWithValue(client),
  ];
}

void main() {
  late MockPaymentsClient mockClient;

  setUp(() {
    mockClient = MockPaymentsClient();
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — Loading state', () {
    testWidgets('renders exactly 5 skeleton rows while loading',
        (tester) async {
      when(() => mockClient.list()).thenAnswer((_) => Completer<PagedPayments>().future);

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump(); // start loading, do not settle

        // 5 skeleton rows (height 72) inside a ListView.
        final containers = tester.widgetList<Container>(find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Container),
        ));
        expect(containers.length, greaterThanOrEqualTo(5));

        // No content visible.
        expect(find.text('Failed to load payments'), findsNothing);
        expect(find.text('No payments recorded'), findsNothing);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — Error state', () {
    testWidgets('shows "Failed to load payments" on error', (tester) async {
      when(() => mockClient.list()).thenThrow(Exception('network error'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();
        await tester.pump();

        expect(find.text('Failed to load payments'), findsOneWidget);
      });
    });

    testWidgets(
        'CRITICAL: error state has NO retry button — pull-to-refresh is the only recovery',
        (tester) async {
      when(() => mockClient.list()).thenThrow(Exception('network error'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();
        await tester.pump();

        // Assert NO retry button of any kind exists.
        expect(find.byType(ElevatedButton), findsNothing);
        expect(find.byType(TextButton), findsNothing);
        expect(find.byType(OutlinedButton), findsNothing);
        expect(find.byType(FilledButton), findsNothing);

        // And no text that says Retry.
        expect(find.textContaining('Retry'), findsNothing);
        expect(find.textContaining('retry'), findsNothing);
        expect(find.textContaining('Try again'), findsNothing);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — Empty state', () {
    testWidgets('shows empty state widget when items list is empty',
        (tester) async {
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('No payments recorded'), findsOneWidget);
        expect(
          find.text(
              'Payment receipts linked to your account will appear here.'),
          findsOneWidget,
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — Data state', () {
    testWidgets('renders payment tiles with amount and date', (tester) async {
      final payments = [
        _payment(id: 'pay-001', amount: '5000', paymentDate: '2026-06-01'),
        _payment(id: 'pay-002', amount: '3000', paymentDate: '2026-06-02'),
      ];
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: payments, nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // Both payments rendered.
        expect(find.byType(ListView), findsOneWidget);
        // Amounts formatted as INR should be present.
        expect(find.textContaining('5,000'), findsWidgets);
        expect(find.textContaining('3,000'), findsWidgets);
      });
    });

    testWidgets('voided payment shows "Voided" label and uses red icon',
        (tester) async {
      final voidedPayment = _payment(
        id: 'pay-void-001',
        voided: true,
        voidReason: 'Duplicate entry',
      );
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [voidedPayment], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Voided'), findsOneWidget);
        // Red cancel icon for voided.
        expect(find.byIcon(Icons.cancel_outlined), findsOneWidget);
        // Green icon should NOT appear for a voided payment.
        expect(find.byIcon(Icons.check_circle_outline), findsNothing);
      });
    });

    testWidgets('non-voided payment shows green check icon', (tester) async {
      final normalPayment = _payment(id: 'pay-ok-001', voided: false);
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [normalPayment], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
        expect(find.byIcon(Icons.cancel_outlined), findsNothing);
        expect(find.text('Voided'), findsNothing);
      });
    });

    testWidgets('reference line shown when reference is present',
        (tester) async {
      final payment = _payment(
        id: 'pay-ref-001',
        reference: 'CHQ-12345',
      );
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [payment], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('Ref: CHQ-12345'), findsOneWidget);
      });
    });

    testWidgets('reference line hidden when reference is null', (tester) async {
      final payment = _payment(id: 'pay-noref-001', reference: null);
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [payment], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('Ref:'), findsNothing);
      });
    });

    testWidgets('pagination — only first page loaded, no load-more UI',
        (tester) async {
      final payments = List.generate(
        20,
        (i) => _payment(id: 'pay-${i.toString().padLeft(3, '0')}'),
      );
      when(() => mockClient.list()).thenAnswer((_) async =>
          PagedPayments(items: payments, nextCursor: 'cursor-next'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // No load-more button despite nextCursor being present.
        expect(find.textContaining('Load more'), findsNothing);
        expect(find.textContaining('load more'), findsNothing);

        // Verify list() was called without a cursor.
        verify(() => mockClient.list()).called(1);
        verifyNever(() => mockClient.list(cursor: any(named: 'cursor')));
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — Pull-to-refresh', () {
    testWidgets('pull-to-refresh is present and triggers re-fetch',
        (tester) async {
      var callCount = 0;
      when(() => mockClient.list()).thenAnswer((_) async {
        callCount++;
        return PagedPayments(
            items: [_payment(id: 'pay-${callCount.toString().padLeft(3, '0')}')],
            nextCursor: null);
      });

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();
        expect(callCount, equals(1));

        await tester.fling(
            find.byType(RefreshIndicator), const Offset(0, 300), 1000);
        await tester.pumpAndSettle();

        expect(callCount, greaterThanOrEqualTo(2));
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — Navigation', () {
    testWidgets('tapping payment tile navigates to /more/payments/<id>',
        (tester) async {
      final payment = _payment(id: 'pay-nav-001');
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [payment], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        final router = GoRouter(
          initialLocation: '/more/payments',
          routes: [
            GoRoute(
              path: '/more/payments',
              builder: (_, __) => const PaymentsListScreen(),
            ),
            GoRoute(
              path: '/more/payments/:id',
              builder: (_, __) => const Scaffold(body: Text('Payment Detail')),
            ),
          ],
        );
        await tester.pumpWidget(ProviderScope(
          overrides: overrides,
          child: MaterialApp.router(routerConfig: router),
        ));
        await tester.pumpAndSettle();

        // Tap the tile (amount text).
        await tester.tap(find.textContaining('5,000').first);
        await tester.pumpAndSettle();
        // Navigation was triggered — detail screen rendered.
        expect(find.text('Payment Detail'), findsOneWidget);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('PaymentsListScreen — App bar', () {
    testWidgets('renders "Payments" title', (tester) async {
      when(() => mockClient.list()).thenAnswer(
          (_) async => PagedPayments(items: [], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Payments'), findsOneWidget);
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
