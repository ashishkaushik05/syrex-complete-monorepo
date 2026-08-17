import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/local/field_local_store.dart';
import '../../core/location/background_location_service.dart';
import '../../modules/field/providers/field_providers.dart';
import '../router/app_router.dart';
import '../theme/app_theme.dart';

class AppBootstrap {
  static Future<void> run() async {
    // Register the background service metadata before it is ever started.
    // Sensitive location permissions are requested contextually on Start Shift.
    unawaited(BackgroundLocationService.configure().timeout(
      const Duration(seconds: 3),
      onTimeout: () {},
    ));

    // Open the SQLite local store before runApp so the provider is available
    // immediately and never throws StateError.
    final fieldLocalStore = await FieldLocalStore.open();

    // Resume tracking + upload if a shift was already active when the app was
    // last killed. Without this the only uploader (FieldSyncWorker) would never
    // start until the user manually re-toggled the shift, stranding the queue.
    final activeShift = await fieldLocalStore.getActiveShift();
    if (activeShift != null) {
      // Recover any points a previous crashed session left mid-upload.
      await fieldLocalStore.resetInflightToPending(activeShift.clientShiftId);
      unawaited(BackgroundLocationService.start());
    }

    runApp(ProviderScope(
      overrides: [
        fieldLocalStoreProvider.overrideWithValue(fieldLocalStore),
      ],
      child: const SalesMobileApp(),
    ));
  }
}

class SalesMobileApp extends ConsumerWidget {
  const SalesMobileApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(sessionControllerProvider, (_, __) {});

    return MaterialApp.router(
      title: 'Sales Mobile',
      theme: AppTheme.light,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
