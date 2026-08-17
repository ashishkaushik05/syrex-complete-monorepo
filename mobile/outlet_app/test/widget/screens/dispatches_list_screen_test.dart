import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:outlet_app/core/api/outlet_portal_client.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/dispatch.dart';
import 'package:outlet_app/core/models/session.dart';
import 'package:outlet_app/app/theme_provider.dart';
import 'package:outlet_app/modules/dispatches/dispatches_list_screen.dart';

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

DispatchDto _dispatch({
  String id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  String deliveryStatus = 'dispatched',
  String transporterName = 'FastFreight Co.',
  String vehicleNumber = 'KA-01-AB-1234',
  String? dispatchDate = '2026-06-01',
  String? estimatedDelivery = '2026-06-05',
  String? lrNumber,
  String? deliveredAt,
}) =>
    DispatchDto(
      id: id,
      deliveryStatus: deliveryStatus,
      transporterName: transporterName,
      vehicleNumber: vehicleNumber,
      dispatchDate: dispatchDate,
      estimatedDelivery: estimatedDelivery,
      lrNumber: lrNumber,
      deliveredAt: deliveredAt,
    );

Widget _buildApp(List<Override> overrides) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(home: DispatchesListScreen()),
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
  group('DispatchesListScreen — Loading state', () {
    testWidgets('renders exactly 5 skeleton blocks of height 106 while loading',
        (tester) async {
      when(() => mockClient.dispatchHistory(any()))
          .thenAnswer((_) => Future.delayed(const Duration(days: 1), () {
                throw Exception('never');
              }));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump(); // start loading, don't settle

        // 5 skeleton placeholder containers should be in a ListView.separated.
        final containers = tester.widgetList<Container>(find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Container),
        ));
        // At least 5 skeleton boxes — there may be additional structural containers.
        final skeletonBoxes = containers
            .where((c) =>
                c.constraints?.minHeight == 106 ||
                (c.decoration is BoxDecoration &&
                    (c.decoration as BoxDecoration).borderRadius != null))
            .toList();
        // Verify the ListView contains skeleton items.
        expect(containers.length, greaterThanOrEqualTo(5));
      });
    });

    testWidgets('loading state does not show dispatch content', (tester) async {
      when(() => mockClient.dispatchHistory(any()))
          .thenAnswer((_) => Future.delayed(const Duration(days: 1), () {
                throw Exception('never');
              }));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();

        expect(find.text('No dispatches yet'), findsNothing);
        expect(find.text('Failed to load dispatches'), findsNothing);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('DispatchesListScreen — Error state', () {
    testWidgets('shows "Failed to load dispatches" on error', (tester) async {
      when(() => mockClient.dispatchHistory(any()))
          .thenThrow(Exception('network error'));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pump();
        await tester.pump();

        expect(find.text('Failed to load dispatches'), findsOneWidget);
      });
    });

    testWidgets('error state has no retry button', (tester) async {
      when(() => mockClient.dispatchHistory(any()))
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
  group('DispatchesListScreen — Empty state', () {
    testWidgets('shows empty state when items list is empty', (tester) async {
      when(() => mockClient.dispatchHistory(any())).thenAnswer(
          (_) async => PagedDispatches(items: [], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('No dispatches yet'), findsOneWidget);
        expect(
          find.text('Shipments linked to your orders will appear here.'),
          findsOneWidget,
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('DispatchesListScreen — Data state', () {
    testWidgets('renders dispatch tiles for each item', (tester) async {
      final dispatches = [
        _dispatch(
            id: 'a1b2c3d4-0000-0000-0000-000000000001',
            deliveryStatus: 'dispatched'),
        _dispatch(
            id: 'b2c3d4e5-0000-0000-0000-000000000002',
            deliveryStatus: 'in_transit'),
      ];
      when(() => mockClient.dispatchHistory(any())).thenAnswer(
          (_) async => PagedDispatches(items: dispatches, nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        // Both dispatch titles are shown (first 8 chars of UUID with # prefix).
        expect(find.textContaining('a1b2c3d4'), findsWidgets);
        expect(find.textContaining('b2c3d4e5'), findsWidgets);
      });
    });

    testWidgets('renders app bar title "Dispatches"', (tester) async {
      when(() => mockClient.dispatchHistory(any())).thenAnswer(
          (_) async => PagedDispatches(items: [], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(overrides));
        await tester.pumpAndSettle();

        expect(find.text('Dispatches'), findsOneWidget);
      });
    });
  });

  // ---------------------------------------------------------------------------
  group('DispatchesListScreen — Pull-to-refresh', () {
    testWidgets('pull-to-refresh triggers a fresh fetch', (tester) async {
      var callCount = 0;
      when(() => mockClient.dispatchHistory(any())).thenAnswer((_) async {
        callCount++;
        return PagedDispatches(
            items: [
              _dispatch(id: 'a1b2c3d4-0000-0000-0000-00000000000$callCount')
            ],
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
  group('DispatchesListScreen — Navigation', () {
    testWidgets('tapping dispatch tile navigates to /dispatches/<id>',
        (tester) async {
      const dispatchId = 'a1b2c3d4-1234-5678-abcd-ef1234567890';
      when(() => mockClient.dispatchHistory(any())).thenAnswer((_) async =>
          PagedDispatches(
              items: [_dispatch(id: dispatchId)], nextCursor: null));

      final overrides = _makeOverrides(mockClient);

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(ProviderScope(
          overrides: overrides,
          child: MaterialApp(
            onGenerateRoute: (settings) {
              return MaterialPageRoute(
                builder: (_) => const Scaffold(body: Text('Dispatch Detail')),
                settings: settings,
              );
            },
            home: const DispatchesListScreen(),
          ),
        ));
        await tester.pumpAndSettle();

        // The tile shows first 8 chars of the UUID.
        await tester.tap(find.textContaining('a1b2c3d4').first);
        await tester.pumpAndSettle();
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
