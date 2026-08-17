import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:outlet_app/app/app.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/models/session.dart';

class _UnauthenticatedController extends SessionController {
  @override
  SessionState build() => SessionState.empty;

  @override
  Future<void> restoreSession() async {}
}

void main() {
  testWidgets('App renders login screen when unauthenticated',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionControllerProvider.overrideWith(_UnauthenticatedController.new),
        ],
        child: const OutletApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sign in'), findsOneWidget);
  });
}
