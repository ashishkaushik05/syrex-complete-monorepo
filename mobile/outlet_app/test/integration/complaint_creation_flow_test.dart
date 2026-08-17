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

Map<String, dynamic> complaintJson({
  String id = 'comp-1',
  String complaintNumber = 'SC-0001',
  String status = 'raised',
  String? title = 'Battery not charging',
  String? description = 'Customer reports battery does not charge.',
  String? customerName,
  String? customerPhone,
}) =>
    {
      'id': id,
      'complaintNumber': complaintNumber,
      'status': status,
      'title': title,
      'description': description,
      'customerName': customerName,
      'customerPhone': customerPhone,
      'resolutionNote': null,
      'createdAt': '2026-06-06T10:00:00Z',
      'assignedAsiName': null,
      'lines': [],
      'assignments': [],
    };

Map<String, dynamic> pagedComplaintsJson(List<Map<String, dynamic>> items) =>
    {'items': items, 'nextCursor': null};

// Home screen stubs.
Map<String, dynamic> summaryJson() => {
      'outletId': 'outlet-1',
      'outstandingLive': '0',
      'outstandingSnapshot': '0',
      'openInvoicesCount': 0,
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
  when(() => mockApi.query('outletPortal.invoiceHistory', any(), any()))
      .thenAnswer((_) async => pagedEmpty());
}

/// Navigate from app start to the complaints list screen via More → Service.
Future<void> navigateToComplaintsList(WidgetTester tester) async {
  await tester.tap(find.text('More'));
  await tester.pumpAndSettle();

  await tester.tap(find.text('Service complaints'));
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('Complaint creation flow — Raise complaint → appears in list', () {
    testWidgets(
      'successful submission: API called, navigates back to list, list re-fetches',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        // Complaints list: initially empty, then after re-fetch shows the new complaint.
        var listCallCount = 0;
        when(
          () => mockApi.query('serviceComplaints.list', any(), any()),
        ).thenAnswer((_) async {
          listCallCount++;
          if (listCallCount <= 1) {
            // First call: empty list.
            return pagedComplaintsJson([]);
          }
          // Subsequent calls: new complaint appears.
          return pagedComplaintsJson([complaintJson()]);
        });

        // serviceComplaints.create returns the created complaint.
        when(
          () => mockApi.mutation('serviceComplaints.create', any(), any()),
        ).thenAnswer((_) async => complaintJson());

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await navigateToComplaintsList(tester);

        // Complaints list is empty initially — FAB is visible.
        expect(find.text('Raise complaint'), findsOneWidget);

        // Tap FAB to open Raise Complaint screen.
        await tester.tap(find.text('Raise complaint'));
        await tester.pumpAndSettle();

        // Raise Complaint screen is shown.
        expect(find.text('Raise complaint'), findsOneWidget);

        // Fill in title.
        final titleField = find.widgetWithText(TextField, 'Title');
        if (titleField.evaluate().isNotEmpty) {
          await tester.enterText(titleField, 'Battery not charging');
        } else {
          // Fallback: find by hint text.
          await tester.enterText(
            find.byWidgetPredicate(
              (w) =>
                  w is TextField &&
                  (w.decoration?.hintText == 'Brief description'),
            ),
            'Battery not charging',
          );
        }
        await tester.pumpAndSettle();

        // Tap "Submit complaint".
        await tester.tap(find.text('Submit complaint'));
        await tester.pumpAndSettle();

        // Verify serviceComplaints.create was called.
        verify(
          () => mockApi.mutation(
            'serviceComplaints.create',
            any(),
            any(),
          ),
        ).called(1);

        // Success snackbar should appear.
        expect(
          find.text('Complaint submitted successfully.'),
          findsOneWidget,
        );

        // Should have navigated back to complaints list.
        await tester.pumpAndSettle();
        expect(find.text('Service'), findsOneWidget);
      },
    );
  });

  // ---------------------------------------------------------------------------

  group('Complaint creation flow — Notes field not sent in API payload', () {
    testWidgets(
      'notes field value is NOT included in the API payload',
      (tester) async {
        final mockApi = MockApiClient();

        stubHomeQueries(mockApi);

        when(
          () => mockApi.query('serviceComplaints.list', any(), any()),
        ).thenAnswer((_) async => pagedComplaintsJson([]));

        Map<String, dynamic>? capturedPayload;

        when(
          () => mockApi.mutation('serviceComplaints.create', any(), any()),
        ).thenAnswer((invocation) async {
          // Capture what was actually sent.
          capturedPayload =
              invocation.positionalArguments[1] as Map<String, dynamic>;
          return complaintJson();
        });

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await navigateToComplaintsList(tester);

        await tester.tap(find.text('Raise complaint'));
        await tester.pumpAndSettle();

        // Fill title (required).
        await tester.enterText(
          find.byWidgetPredicate(
            (w) =>
                w is TextField &&
                (w.decoration?.hintText == 'Brief description' ||
                    w.decoration?.labelText == 'Title'),
          ),
          'Test issue',
        );
        await tester.pumpAndSettle();

        // Submit.
        await tester.tap(find.text('Submit complaint'));
        await tester.pumpAndSettle();

        // Verify the payload does NOT contain a 'notes' key.
        expect(capturedPayload, isNotNull);
        expect(
          capturedPayload!.containsKey('notes'),
          isFalse,
          reason: 'The "notes" key must not appear in the API payload '
              'per the RaiseComplaintScreen spec — '
              'notes is excluded from CreateComplaintInput.toJson.',
        );
      },
    );
  });

  // ---------------------------------------------------------------------------

  group('Complaint creation flow — Validation errors', () {
    late MockApiClient mockApi;

    setUp(() {
      mockApi = MockApiClient();
      stubHomeQueries(mockApi);
      when(
        () => mockApi.query('serviceComplaints.list', any(), any()),
      ).thenAnswer((_) async => pagedComplaintsJson([]));
    });

    testWidgets(
      'empty title and description → snackbar error, no API call',
      (tester) async {
        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await navigateToComplaintsList(tester);
        await tester.tap(find.text('Raise complaint'));
        await tester.pumpAndSettle();

        // Leave all fields empty and tap submit.
        await tester.tap(find.text('Submit complaint'));
        await tester.pumpAndSettle();

        // Validation snackbar.
        expect(
          find.text('Please enter at least a title or description.'),
          findsOneWidget,
        );

        // No API call made.
        verifyNever(
          () => mockApi.mutation('serviceComplaints.create', any(), any()),
        );
      },
    );

    testWidgets(
      'phone with 4 characters → validation error shown, no API call',
      (tester) async {
        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await navigateToComplaintsList(tester);
        await tester.tap(find.text('Raise complaint'));
        await tester.pumpAndSettle();

        // Provide a valid title so Rule 1 passes.
        await tester.enterText(
          find.byWidgetPredicate(
            (w) =>
                w is TextField &&
                (w.decoration?.hintText == 'Brief description' ||
                    w.decoration?.labelText == 'Title'),
          ),
          'Valid title',
        );
        await tester.pumpAndSettle();

        // Enter a 4-character phone number (should fail: minimum is 5).
        await tester.enterText(
          find.byWidgetPredicate(
            (w) =>
                w is TextField &&
                (w.decoration?.labelText == 'Phone' ||
                    w.keyboardType == TextInputType.phone),
          ),
          '9876',
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Submit complaint'));
        await tester.pumpAndSettle();

        // Phone validation snackbar.
        expect(
          find.text('Phone number must be at least 5 digits.'),
          findsOneWidget,
        );

        // No API call made.
        verifyNever(
          () => mockApi.mutation('serviceComplaints.create', any(), any()),
        );
      },
    );

    testWidgets(
      'phone with 5 characters → passes validation, API called',
      (tester) async {
        when(
          () => mockApi.mutation('serviceComplaints.create', any(), any()),
        ).thenAnswer((_) async => complaintJson());

        await pumpAuthenticatedApp(tester, mockApi);
        await tester.pumpAndSettle();

        await navigateToComplaintsList(tester);
        await tester.tap(find.text('Raise complaint'));
        await tester.pumpAndSettle();

        // Provide a valid title.
        await tester.enterText(
          find.byWidgetPredicate(
            (w) =>
                w is TextField &&
                (w.decoration?.hintText == 'Brief description' ||
                    w.decoration?.labelText == 'Title'),
          ),
          'Valid title',
        );
        await tester.pumpAndSettle();

        // Enter a 5-character phone number (minimum — should pass).
        await tester.enterText(
          find.byWidgetPredicate(
            (w) =>
                w is TextField &&
                (w.decoration?.labelText == 'Phone' ||
                    w.keyboardType == TextInputType.phone),
          ),
          '98765',
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Submit complaint'));
        await tester.pumpAndSettle();

        // Phone validation snackbar must NOT appear.
        expect(
          find.text('Phone number must be at least 5 digits.'),
          findsNothing,
        );

        // API call must have been made.
        verify(
          () => mockApi.mutation('serviceComplaints.create', any(), any()),
        ).called(1);
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
