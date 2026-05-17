import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/location/background_location_service.dart';
import '../../core/permissions/field_permission_service.dart';
import '../router/app_router.dart';
import '../theme/app_theme.dart';

class AppBootstrap {
  static Future<void> run() async {
    // Request location, background location, and battery optimisation
    // exemption before anything else runs — the background service needs
    // these to be granted before it can start tracking.
    await FieldPermissionService.requestAll();

    // Configure background location service once at startup so the
    // foreground service metadata is registered before it is ever started.
    await BackgroundLocationService.configure();

    runApp(const ProviderScope(child: OutletOwnerTemplateApp()));
  }
}

class OutletOwnerTemplateApp extends ConsumerWidget {
  const OutletOwnerTemplateApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(sessionControllerProvider, (_, __) {});

    return MaterialApp.router(
      title: 'Outlet Owner Template',
      theme: AppTheme.light,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
