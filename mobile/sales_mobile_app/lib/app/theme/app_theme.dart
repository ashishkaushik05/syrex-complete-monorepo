import 'package:flutter/material.dart';
import '../../shared/widgets/premium_surfaces.dart';

class AppTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppPalette.ocean,
      brightness: Brightness.light,
      surface: AppPalette.cloud,
      primary: AppPalette.ocean,
      secondary: AppPalette.mint,
      error: AppPalette.rose,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppPalette.cloud,
      fontFamily: 'serif',
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}
