import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../router/app_router.dart';
import '../theme/app_theme.dart';

class AppBootstrap {
  static Future<void> run() async {
    runApp(const ProviderScope(child: ServiceMobileApp()));
  }
}

class ServiceMobileApp extends ConsumerWidget {
  const ServiceMobileApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Service Mobile',
      theme: AppTheme.light,
      routerConfig: ref.watch(appRouterProvider),
      debugShowCheckedModeBanner: false,
    );
  }
}
