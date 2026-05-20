import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/field/field_shift_controller.dart';
import '../../core/location/background_location_service.dart';
import '../router/app_router.dart';
import '../theme/app_theme.dart';

class AppBootstrap {
  static Future<void> run() async {
    // Configure background service metadata (must happen before first start).
    await BackgroundLocationService.configure();

    // Permissions are NOT requested here — they are contextual to shift-start.
    // See FieldPermissionCoordinator.requestForShiftStart().

    runApp(const ProviderScope(child: OutletOwnerTemplateApp()));
  }
}

class OutletOwnerTemplateApp extends ConsumerWidget {
  const OutletOwnerTemplateApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(sessionControllerProvider, (_, __) {});

    // Warm up the shift controller on startup — restores state from SQLite
    // and kicks off sync if there is an active local shift.
    ref.watch(fieldShiftControllerProvider);

    return MaterialApp.router(
      title: 'Outlet Owner Template',
      theme: AppTheme.light,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
