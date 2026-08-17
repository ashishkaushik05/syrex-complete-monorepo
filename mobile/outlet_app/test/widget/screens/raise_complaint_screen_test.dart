// ignore_for_file: lines_longer_than_80_chars

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:go_router/go_router.dart';
import 'package:outlet_app/core/api/api_client.dart';
import 'package:outlet_app/modules/service/raise_complaint_screen.dart';
import 'package:outlet_app/core/api/service_client.dart';
import 'package:outlet_app/core/models/service_complaint.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockServiceClient extends Mock implements ServiceClient {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Map<String, dynamic> _complaintJson({
  String id = 'c1',
  String complaintNumber = 'SC-0001',
  String status = 'raised',
}) =>
    {
      'id': id,
      'complaintNumber': complaintNumber,
      'status': status,
      'lines': [],
      'assignments': [],
    };

Widget _buildApp(MockServiceClient client) {
  final router = GoRouter(
    initialLocation: '/more/service/new',
    routes: [
      GoRoute(
        path: '/more/service',
        builder: (_, __) => const Scaffold(body: Text('ComplaintsList')),
        routes: [
          GoRoute(
            path: 'new',
            builder: (_, __) => const RaiseComplaintScreen(),
          ),
        ],
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      serviceClientProvider.overrideWithValue(client),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

// ---------------------------------------------------------------------------
// Helpers — field finders
// TextFormField order in the screen: 0=Title, 1=Details, 2=Customer name, 3=Phone, 4=Serial number
// ---------------------------------------------------------------------------

Finder _titleField() => find.byType(TextFormField).at(0);
Finder _detailsField() => find.byType(TextFormField).at(1);
Finder _customerNameField() => find.byType(TextFormField).at(2);
Finder _phoneField() => find.byType(TextFormField).at(3);
Finder _serialField() => find.byType(TextFormField).at(4);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late MockServiceClient client;

  setUp(() {
    client = MockServiceClient();
    registerFallbackValue(CreateComplaintInput(lines: []));
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Fields rendered', () {
    testWidgets('renders Title field', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Title'), findsOneWidget);
    });

    testWidgets('renders Details field', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Details'), findsOneWidget);
    });

    testWidgets('renders Customer name field', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Customer name'), findsOneWidget);
    });

    testWidgets('renders Phone field', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Phone'), findsOneWidget);
    });

    testWidgets('renders Serial number field', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Serial number'), findsOneWidget);
    });

    testWidgets('renders Submit complaint button', (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      expect(find.text('Submit complaint'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Validation Rule 1: title and description required',
      () {
    testWidgets(
        'both empty → snackbar "Please enter at least a title or description."',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(
          find.text('Please enter at least a title or description.'),
          findsOneWidget);
      verifyNever(() => client.createComplaint(any()));
    });

    testWidgets('only title present passes Rule 1', (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'My title');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Please enter at least a title or description.'),
          findsNothing);
    });

    testWidgets('only description present passes Rule 1', (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_detailsField(), 'My description');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Please enter at least a title or description.'),
          findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Validation Rule 2: phone minimum length', () {
    testWidgets('phone with 4 chars → "Phone number must be at least 5 digits."',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Some title');
      await tester.enterText(_phoneField(), '1234');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Phone number must be at least 5 digits.'), findsOneWidget);
      verifyNever(() => client.createComplaint(any()));
    });

    testWidgets('phone with exactly 5 chars passes Rule 2', (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Some title');
      await tester.enterText(_phoneField(), '12345');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Phone number must be at least 5 digits.'), findsNothing);
    });

    testWidgets('empty phone is allowed — Rule 2 not triggered', (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Some title');
      // Phone left empty
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Phone number must be at least 5 digits.'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Validation Rule 3: serial number minimum length',
      () {
    testWidgets(
        'serial with 1 char → "Serial number must be at least 2 characters."',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Some title');
      await tester.enterText(_serialField(), 'A');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Serial number must be at least 2 characters.'),
          findsOneWidget);
      verifyNever(() => client.createComplaint(any()));
    });

    testWidgets('serial with exactly 2 chars passes Rule 3', (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Some title');
      await tester.enterText(_serialField(), 'AB');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Serial number must be at least 2 characters.'),
          findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Validation order (Rule 1 before Rule 2)', () {
    testWidgets(
        'Rule 1 fires first when both title/desc empty and phone too short',
        (tester) async {
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_phoneField(), '12');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Please enter at least a title or description.'),
          findsOneWidget);
      expect(find.text('Phone number must be at least 5 digits.'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group(
      'RaiseComplaintScreen — Critical: "notes" key absent from API payload',
      () {
    testWidgets('createComplaint toJson does not include top-level "notes" key',
        (tester) async {
      CreateComplaintInput? capturedInput;
      when(() => client.createComplaint(any())).thenAnswer((invocation) async {
        capturedInput =
            invocation.positionalArguments.first as CreateComplaintInput;
        return ComplaintDto.fromJson(_complaintJson());
      });

      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test complaint');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();

      expect(capturedInput, isNotNull);
      final json = capturedInput!.toJson();
      expect(json.containsKey('notes'), isFalse,
          reason: '"notes" is a dead field and must not appear in the API payload');
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Submit flow: success', () {
    testWidgets('calls createComplaint with correct payload', (tester) async {
      CreateComplaintInput? capturedInput;
      when(() => client.createComplaint(any())).thenAnswer((invocation) async {
        capturedInput =
            invocation.positionalArguments.first as CreateComplaintInput;
        return ComplaintDto.fromJson(_complaintJson());
      });

      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Battery failure');
      await tester.enterText(_detailsField(), 'Full description');
      await tester.enterText(_customerNameField(), 'Ravi Kumar');
      await tester.enterText(_phoneField(), '98765');
      await tester.enterText(_serialField(), 'SRX12345');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();

      verify(() => client.createComplaint(any())).called(1);
      expect(capturedInput?.title, 'Battery failure');
      expect(capturedInput?.description, 'Full description');
      expect(capturedInput?.customerName, 'Ravi Kumar');
      expect(capturedInput?.customerPhone, '98765');
      expect(capturedInput?.lines.length, 1);
      expect(capturedInput?.lines.first.serialNumber, 'SRX12345');
    });

    testWidgets('success shows "Complaint submitted successfully." snackbar',
        (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Complaint submitted successfully.'), findsOneWidget);
    });

    testWidgets('success navigates back (screen is popped)', (tester) async {
      when(() => client.createComplaint(any())).thenAnswer((_) async =>
          ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Submit complaint'), findsNothing);
    });

    testWidgets('empty title is sent as null in payload', (tester) async {
      CreateComplaintInput? capturedInput;
      when(() => client.createComplaint(any())).thenAnswer((invocation) async {
        capturedInput =
            invocation.positionalArguments.first as CreateComplaintInput;
        return ComplaintDto.fromJson(_complaintJson());
      });
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      // Only fill description
      await tester.enterText(_detailsField(), 'Desc only');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(capturedInput?.title, isNull);
    });

    testWidgets('empty serial results in empty lines list', (tester) async {
      CreateComplaintInput? capturedInput;
      when(() => client.createComplaint(any())).thenAnswer((invocation) async {
        capturedInput =
            invocation.positionalArguments.first as CreateComplaintInput;
        return ComplaintDto.fromJson(_complaintJson());
      });
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test');
      // Do not fill serial number
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(capturedInput?.lines, isEmpty);
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Submit flow: failure', () {
    testWidgets('API failure shows "Failed to submit: ..." snackbar with red background',
        (tester) async {
      when(() => client.createComplaint(any()))
          .thenThrow(Exception('Server error'));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Failed to submit:'), findsOneWidget);
      final snackBar = tester.widget<SnackBar>(find.byType(SnackBar).last);
      expect(snackBar.backgroundColor, Colors.red);
    });

    testWidgets('screen stays visible on API failure', (tester) async {
      when(() => client.createComplaint(any()))
          .thenThrow(Exception('Server error'));
      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test');
      await tester.tap(find.text('Submit complaint'));
      await tester.pumpAndSettle();
      expect(find.text('Submit complaint'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('RaiseComplaintScreen — Submit button disabled while loading', () {
    testWidgets('double-tap while loading results in only one API call',
        (tester) async {
      final completer = Completer<ComplaintDto>();
      when(() => client.createComplaint(any()))
          .thenAnswer((_) => completer.future);

      await tester.pumpWidget(_buildApp(client));
      await tester.pumpAndSettle();
      await tester.enterText(_titleField(), 'Test');
      await tester.tap(find.text('Submit complaint'));
      await tester.pump(); // start loading

      // Attempt second tap while loading
      await tester.tap(find.text('Submit complaint'));
      await tester.pump();

      completer.complete(ComplaintDto.fromJson(_complaintJson()));
      await tester.pumpAndSettle();

      verify(() => client.createComplaint(any())).called(1);
    });
  });
}
