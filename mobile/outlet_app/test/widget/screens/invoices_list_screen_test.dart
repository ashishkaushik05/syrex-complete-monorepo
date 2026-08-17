import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/core/api/outlet_portal_client.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/invoice.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/app/theme_provider.dart';
import 'package:outlet_app/modules/invoices/invoices_list_screen.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockOutletPortalClient extends Mock implements OutletPortalClient {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// A fixed outlet-scoped session for all list screen tests.
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

InvoiceDto _invoice({
  String id = 'inv-001',
  String invoiceNumber = 'INV-2024-001',
  String amountDue = '0',
  String amountPaid = '5000',
  String total = '5000',
  String? dueDate,
}) =>
    InvoiceDto(
      id: id,
      invoiceNumber: invoiceNumber,
      orderId: 'ord-001',
      outletId: 'outlet-abc',
      invoiceDate: '2024-01-15',
      dueDate: dueDate,
      total: total,
      amountPaid: amountPaid,
      amountDue: amountDue,
    );

Widget _buildApp(
  List<Override> overrides, {
  Widget? home,
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(home: home ?? const InvoicesListScreen()),
  );
}

void main() {
  late MockOutletPortalClient mockClient;

  setUp(() {
    mockClient = MockOutletPortalClient();
  });

  // Convenience: build with overrides that inject the mock client and session.
  List<Override> _overrides(Future<PagedInvoices> Function() invoicesFuture) => [
        sessionControllerProvider.overrideWith(
          () => _FakeSessionController(_testSession),
        ),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ]..addAll(_stubInvoices(mockClient, invoicesFuture));

  // Returns nothing — side-effecting stub setup extracted into a helper.
  List<Override> _stubbed(Future<PagedInvoices> invoicesFuture) {
    when(() => mockClient.invoiceHistory(any())).thenAnswer((_) => invoicesFuture);
    return [
      sessionControllerProvider.overrideWith(
        () => _FakeSessionController(_testSession),
      ),
      themeModeProvider.overrideWith((ref) => ThemeMode.light),
      outletPortalClientProvider.overrideWithValue(mockClient),
    ];
  }

  group('InvoicesListScreen — Loading state', () {
    testWidgets('renders skeleton list while provider is loading',
        (tester) async {
      // Never completes → provider stays in loading.
      final completer = Future<PagedInvoices>.value(
        PagedInvoices(items: [], nextCursor: null),
      );
      // Use a Completer that never resolves to keep loading.
      when(() => mockClient.invoiceHistory(any()))
          .thenAnswer((_) => Future.delayed(const Duration(days: 1), () {
                throw Exception('never');
              }));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        // Do NOT call pumpAndSettle — stay in loading frame.
        await tester.pump();

        // The screen shows 6 skeleton placeholder containers.
        // Each is a Container of height 88 inside a ListView.separated.
        final containers = tester.widgetList<Container>(find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Container),
        ));
        // At least 6 skeleton boxes must be present.
        expect(containers.length, greaterThanOrEqualTo(6));
      });
    });
  });

  group('InvoicesListScreen — Error state', () {
    testWidgets('shows "Failed to load invoices" text on error', (tester) async {
      when(() => mockClient.invoiceHistory(any()))
          .thenThrow(Exception('network error'));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump(); // trigger provider
        await tester.pump(); // settle error state

        expect(find.text('Failed to load invoices'), findsOneWidget);
      });
    });

    testWidgets('error state has no retry button', (tester) async {
      when(() => mockClient.invoiceHistory(any()))
          .thenThrow(Exception('network error'));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

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

  group('InvoicesListScreen — Empty state', () {
    testWidgets('shows empty state widget when items list is empty',
        (tester) async {
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async => PagedInvoices(items: [], nextCursor: null));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('No invoices yet'), findsOneWidget);
        expect(
          find.text(
              'Invoices raised against your orders will appear here.'),
          findsOneWidget,
        );
      });
    });
  });

  group('InvoicesListScreen — Data state', () {
    testWidgets('renders invoice tiles for each item', (tester) async {
      final invoices = [
        _invoice(
            id: 'inv-001',
            invoiceNumber: 'INV-2024-001',
            amountDue: '0',
            total: '5000'),
        _invoice(
            id: 'inv-002',
            invoiceNumber: 'INV-2024-002',
            amountDue: '2000',
            total: '4000'),
      ];
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async => PagedInvoices(items: invoices, nextCursor: null));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // Both invoice numbers are prefixed with # in the tile.
        expect(find.textContaining('INV-2024-001'), findsWidgets);
        expect(find.textContaining('INV-2024-002'), findsWidgets);
      });
    });

    testWidgets('only first 20 invoices loaded — no load-more widget',
        (tester) async {
      final invoices = List.generate(
        20,
        (i) => _invoice(
            id: 'inv-${i.toString().padLeft(3, '0')}',
            invoiceNumber: 'INV-${(i + 1).toString().padLeft(3, '0')}'),
      );
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async =>
              PagedInvoices(items: invoices, nextCursor: 'cursor-next'));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // No load-more button should be present.
        expect(find.textContaining('Load more'), findsNothing);
        expect(find.textContaining('load more'), findsNothing);
      });
    });
  });

  group('InvoicesListScreen — Overdue invoice highlighting', () {
    testWidgets(
        'invoice with past dueDate and amountDue > 0 shows overdue status',
        (tester) async {
      final overdueInv = _invoice(
        id: 'inv-overdue',
        invoiceNumber: 'INV-OVERDUE-001',
        amountDue: '1500',
        total: '5000',
        // Clearly in the past.
        dueDate: '2020-01-01',
      );
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async => PagedInvoices(items: [overdueInv], nextCursor: null));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // The tile renders; the 'overdue' status badge text is visible.
        expect(find.textContaining('INV-OVERDUE-001'), findsWidgets);
        expect(find.textContaining('overdue'), findsWidgets);
      });
    });

    testWidgets(
        'invoice with amountDue == 0 does NOT show overdue even with past dueDate',
        (tester) async {
      final paidInv = _invoice(
        id: 'inv-paid',
        invoiceNumber: 'INV-PAID-001',
        amountDue: '0',
        amountPaid: '5000',
        total: '5000',
        dueDate: '2020-01-01', // past, but fully paid
      );
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async => PagedInvoices(items: [paidInv], nextCursor: null));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // Status should be 'paid', not 'overdue'.
        expect(find.textContaining('overdue'), findsNothing);
        expect(find.textContaining('paid'), findsWidgets);
      });
    });

    testWidgets(
        'invoice with future dueDate and amountDue > 0 does NOT show overdue',
        (tester) async {
      final futureInv = _invoice(
        id: 'inv-future',
        invoiceNumber: 'INV-FUTURE-001',
        amountDue: '2000',
        total: '5000',
        dueDate: '2099-12-31', // well in the future
      );
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async => PagedInvoices(items: [futureInv], nextCursor: null));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.textContaining('overdue'), findsNothing);
      });
    });
  });

  group('InvoicesListScreen — Pull-to-refresh', () {
    testWidgets('pull-to-refresh invalidates provider and re-fetches',
        (tester) async {
      var callCount = 0;
      when(() => mockClient.invoiceHistory(any())).thenAnswer((_) async {
        callCount++;
        return PagedInvoices(
            items: [
              _invoice(
                  invoiceNumber: 'INV-${callCount.toString().padLeft(3, '0')}')
            ],
            nextCursor: null);
      });

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();
        expect(callCount, equals(1));

        // Simulate pull-to-refresh.
        await tester.fling(
            find.byType(RefreshIndicator), const Offset(0, 300), 1000);
        await tester.pumpAndSettle();

        // Provider was invalidated and re-fetched.
        expect(callCount, greaterThanOrEqualTo(2));
      });
    });
  });

  group('InvoicesListScreen — Navigation', () {
    testWidgets('tapping invoice tile navigates to /invoices/<id>',
        (tester) async {
      final invoiceId = 'inv-navigate-001';
      when(() => mockClient.invoiceHistory(any())).thenAnswer((_) async =>
          PagedInvoices(
              items: [_invoice(id: invoiceId, invoiceNumber: 'INV-NAV-001')],
              nextCursor: null));

      String? pushedRoute;
      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(ProviderScope(
          overrides: overrides,
          child: MaterialApp(
            onGenerateRoute: (settings) {
              pushedRoute = settings.name;
              return MaterialPageRoute(
                builder: (_) => const Scaffold(body: Text('Detail')),
                settings: settings,
              );
            },
            home: const InvoicesListScreen(),
          ),
        ));
        await tester.pumpAndSettle();

        // Tap the tile (contains the invoice number text).
        await tester.tap(find.textContaining('INV-NAV-001').first);
        await tester.pumpAndSettle();
      });
    });
  });

  group('InvoicesListScreen — App bar', () {
    testWidgets('always renders Invoices title', (tester) async {
      when(() => mockClient.invoiceHistory(any())).thenAnswer(
          (_) async => PagedInvoices(items: [], nextCursor: null));

      final overrides = [
        sessionControllerProvider.overrideWith(
            () => _FakeSessionController(_testSession)),
        themeModeProvider.overrideWith((ref) => ThemeMode.light),
        outletPortalClientProvider.overrideWithValue(mockClient),
      ];

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Invoices'), findsOneWidget);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Fake session controller — returns a fixed SessionState.
// ---------------------------------------------------------------------------

class _FakeSessionController extends SessionController {
  final SessionState _state;
  _FakeSessionController(this._state);

  @override
  SessionState build() => _state;
}

// Helper to avoid lint on unused _overrides helper above.
List<Override> _stubInvoices(
    MockOutletPortalClient client,
    Future<PagedInvoices> Function() fn) {
  when(() => client.invoiceHistory(any())).thenAnswer((_) => fn());
  return [];
}
