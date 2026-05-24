import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/location/background_location_service.dart';
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
