import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/auth/session_controller.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../core/network/connectivity_provider.dart';
import '../core/theme/app_theme.dart';
import 'router.dart';
import 'theme_provider.dart';

final _scaffoldKey = GlobalKey<ScaffoldMessengerState>();

class OutletApp extends ConsumerWidget {
  const OutletApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    // Show/hide a persistent offline banner via ScaffoldMessenger.
    // Also re-verify the session when connectivity returns after an offline restore.
    ref.listen<AsyncValue<bool>>(isOnlineProvider, (prev, next) {
      final wasOnline = prev?.valueOrNull ?? true;
      final isOnline = next.valueOrNull ?? true;

      if (isOnline && !wasOnline) {
        final session = ref.read(sessionControllerProvider);
        if (session.isOffline) {
          ref.read(sessionControllerProvider.notifier).restoreSession();
        }
      }

      if (!isOnline && wasOnline) {
        _scaffoldKey.currentState
          ?..clearMaterialBanners()
          ..showMaterialBanner(
            MaterialBanner(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              backgroundColor: AppColors.amberLight,
              content: Row(
                children: [
                  const Icon(Icons.wifi_off_rounded,
                      size: 18, color: Colors.white),
                  const SizedBox(width: 10),
                  Text(
                    'No internet connection',
                    style: AppTextStyles.smallLabelBold(color: Colors.white),
                  ),
                ],
              ),
              actions: const [SizedBox.shrink()],
            ),
          );
      } else if (isOnline && !wasOnline) {
        _scaffoldKey.currentState?.clearMaterialBanners();
      }
    });

    return MaterialApp.router(
      title: 'Syrex Outlet',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _scaffoldKey,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
    );
  }
}
