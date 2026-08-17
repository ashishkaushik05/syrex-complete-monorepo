import 'package:flutter/material.dart';

class AppTheme {
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E)),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          alignLabelWithHint: true,
        ),
        cardTheme: const CardTheme(
          margin: EdgeInsets.symmetric(vertical: 6),
        ),
      );
}
