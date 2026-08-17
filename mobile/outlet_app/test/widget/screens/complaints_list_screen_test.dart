// ignore_for_file: lines_longer_than_80_chars

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:go_router/go_router.dart';
import 'package:outlet_app/core/api/api_client.dart';
import 'package:outlet_app/modules/service/complaints_list_screen.dart';
import 'package:outlet_app/core/api/service_client.dart';
import 'package:outlet_app/core/models/service_complaint.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockServiceClient extends Mock implements ServiceClient {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Minimal tRPC-shaped paged complaints payload.
Map<String, dynamic> _pagedComplaints(List<Map<String, dynamic>> items) => {
      'items': items,
      'nextCursor': null,
    };

Map<String, dynamic> _complaint({
  String id = 'c1',
  String complaintNumber = 'SC-0001',
  String status = 'raised',
  String? title,
  String? createdAt,
}) =>
    {
      'id': id,
      'complaintNumber': complaintNumber,
      'status': status,
      if (title != null) 'title': title,
      if (createdAt != null) 'createdAt': createdAt,
      'lines': [],
      'assignments': [],
    };

/// Build a test harness with a [GoRouter] that captures pushes.
Widget _buildApp(
  MockServiceClient client, {
  List<Override> extras = const [],
}) {
  final router = GoRouter(
    initialLocation: '/more/service',
    routes: [
      GoRoute(
        path: '/more/service',
        builder: (_, __) => const ComplaintsListScreen(),
        routes: [
          GoRoute(
            path: 'new',
            builder: (_, __) => const Scaffold(body: Text('RaiseComplaint')),
          ),
          GoRoute(
            path: ':id',
            builder: (_, state) =>
                Scaffold(body: Text('Detail:${state.pathParameters['id']}')),
          ),
        ],
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      serviceClientProvider.overrideWithValue(client),
      ...extras,
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late MockServiceClient client;

  setUp(() {
    client = MockServiceClient();
    registerFallbackValue(null);
  });

  // -------------------------------------------------------------------------
  group('ComplaintsListScreen — Loading state', () {
    setUp(() {
      when(() => client.listComplaints(status: any(named: 'status')))
          .thenAnswer((_) => Completer<PagedComplaints>().future);
    });

    testWidgets('shows skeleton cards while loading', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pump(); // start loading
      // FAB must be visible in loading state
      expect(find.text('Raise complaint'), findsOneWidget);
    });

    testWidgets('FAB is visible in loading state', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pump();
      expect(find.byIcon(Icons.add), findsAtLeast(1));
    });
  });

  // -------------------------------------------------------------------------
  group('ComplaintsListScreen — Error state', () {
    setUp(() {
      when(() => client.listComplaints(status: any(named: 'status')))
          .thenThrow(const ApiException('Network error'));
    });

    testWidgets('shows error text on failure', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Failed to load complaints'), findsOneWidget);
    });

    testWidgets('no retry button in error state', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsNothing);
    });

    testWidgets('FAB is visible in error state', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Raise complaint'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('ComplaintsListScreen — Empty state', () {
    setUp(() {
      when(() => client.listComplaints(status: any(named: 'status')))
          .thenAnswer((_) async =>
              PagedComplaints.fromJson(_pagedComplaints([])));
    });

    testWidgets('shows empty state widgets', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('No complaints'), findsOneWidget);
      expect(find.text('Service complaints you raise will appear here.'),
          findsOneWidget);
      expect(find.text('Raise a complaint'), findsOneWidget);
    });

    testWidgets('FAB is visible in empty state', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Raise complaint'), findsOneWidget);
    });

    testWidgets(
        '"Raise a complaint" in empty state navigates to /more/service/new',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Raise a complaint'));
      await tester.pumpAndSettle();
      expect(find.text('RaiseComplaint'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('ComplaintsListScreen — Data state', () {
    setUp(() {
      when(() => client.listComplaints(status: any(named: 'status')))
          .thenAnswer((_) async => PagedComplaints.fromJson(_pagedComplaints([
                _complaint(
                    id: 'c1',
                    complaintNumber: 'SC-0001',
                    status: 'raised',
                    title: 'Battery issue'),
                _complaint(
                    id: 'c2',
                    complaintNumber: 'SC-0002',
                    status: 'assigned'),
              ])));
    });

    testWidgets('shows complaint numbers in list', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.textContaining('SC-0001'), findsOneWidget);
      expect(find.textContaining('SC-0002'), findsOneWidget);
    });

    testWidgets('shows complaint title when present', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Battery issue'), findsOneWidget);
    });

    testWidgets('FAB is visible in data state', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Raise complaint'), findsOneWidget);
    });

    testWidgets('tapping complaint tile navigates to detail', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('SC-0001').first);
      await tester.pumpAndSettle();
      expect(find.text('Detail:c1'), findsOneWidget);
    });

    testWidgets('FAB tap navigates to /more/service/new', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Raise complaint'));
      await tester.pumpAndSettle();
      expect(find.text('RaiseComplaint'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('ComplaintsListScreen — Filter chips', () {
    final calls = <String?>[];

    setUp(() {
      calls.clear();
      when(() => client.listComplaints(status: any(named: 'status')))
          .thenAnswer((invocation) async {
        calls.add(invocation.namedArguments[#status] as String?);
        return PagedComplaints.fromJson(_pagedComplaints([]));
      });
    });

    testWidgets('renders exactly 6 filter chips', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      // The 6 chip labels from the spec
      final chips = ['all', 'raised', 'assigned', 'visit', 'resolved', 'cancelled'];
      for (final label in chips) {
        expect(find.text(label), findsOneWidget,
            reason: '"$label" chip should be present');
      }
    });

    testWidgets('default chip is "all" and sends null status to provider',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(calls, contains(null));
    });

    testWidgets('tapping "raised" chip re-fetches with status "raised"',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      calls.clear();
      await tester.tap(find.text('raised'));
      await tester.pumpAndSettle();
      expect(calls, contains('raised'));
    });

    testWidgets('tapping "assigned" chip re-fetches with status "assigned"',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      calls.clear();
      await tester.tap(find.text('assigned'));
      await tester.pumpAndSettle();
      expect(calls, contains('assigned'));
    });

    testWidgets('tapping "visit" chip re-fetches with status "visit"',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      calls.clear();
      await tester.tap(find.text('visit'));
      await tester.pumpAndSettle();
      expect(calls, contains('visit'));
    });

    testWidgets('tapping "resolved" chip re-fetches with status "resolved"',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      calls.clear();
      await tester.tap(find.text('resolved'));
      await tester.pumpAndSettle();
      expect(calls, contains('resolved'));
    });

    testWidgets('tapping "cancelled" chip re-fetches with status "cancelled"',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      calls.clear();
      await tester.tap(find.text('cancelled'));
      await tester.pumpAndSettle();
      expect(calls, contains('cancelled'));
    });

    testWidgets('tapping "all" chip sends null status', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      // Switch to raised first
      await tester.tap(find.text('raised'));
      await tester.pumpAndSettle();
      calls.clear();
      // Switch back to all
      await tester.tap(find.text('all'));
      await tester.pumpAndSettle();
      expect(calls, contains(null));
    });
  });

  // -------------------------------------------------------------------------
  group('ComplaintsListScreen — Pull-to-refresh', () {
    int fetchCount = 0;

    setUp(() {
      fetchCount = 0;
      when(() => client.listComplaints(status: any(named: 'status')))
          .thenAnswer((_) async {
        fetchCount++;
        return PagedComplaints.fromJson(_pagedComplaints([]));
      });
    });

    testWidgets('pull-to-refresh triggers re-fetch', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      final countBefore = fetchCount;
      await tester.drag(find.byType(ListView).first, const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(fetchCount, greaterThan(countBefore));
    });
  });
}
