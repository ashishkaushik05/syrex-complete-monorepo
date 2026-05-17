import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/location/background_location_service.dart';
import '../../core/permissions/field_permission_service.dart';
import '../router/app_router.dart';
import '../theme/app_theme.dart';

class AppBootstrap {
  static Future<void> run() async {
    // 1. Request location + background-location + battery-opt exemption.
    await FieldPermissionService.requestAll();

    // 2. Register the background service metadata so Android knows about
    //    the foreground service before it is ever started.
    await BackgroundLocationService.configure();

    runApp(const ProviderScope(child: SalesMobileApp()));
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
