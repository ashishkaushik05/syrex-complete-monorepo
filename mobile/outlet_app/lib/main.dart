import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app/app.dart';
import 'core/auth/session_controller.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final container = ProviderContainer();

  // Show the app immediately (router shows splash while isRestoring = true).
  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const OutletApp(),
    ),
  );

  // Restore session in the background — router will transition once done.
  container.read(sessionControllerProvider.notifier).restoreSession();
}
