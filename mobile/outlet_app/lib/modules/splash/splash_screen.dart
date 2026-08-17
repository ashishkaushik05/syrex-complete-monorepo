import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const c = AppThemeColors(dark: false);
    return Scaffold(
      backgroundColor: c.bg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: c.accent,
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.store_outlined,
                  size: 42, color: Colors.white),
            ),
            const SizedBox(height: 20),
            Text('Syrex Outlet',
                style: AppTextStyles.headingXl(color: c.text)),
            const SizedBox(height: 36),
            SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: c.accent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
