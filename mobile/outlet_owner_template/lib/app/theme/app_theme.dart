import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(isDark: false);
  static ThemeData get dark => _build(isDark: true);

  static ThemeData _build({required bool isDark}) {
    final cs = isDark ? AppColorScheme.dark() : AppColorScheme.light();
    const primaryColor = Color(0xFF6366F1);

    final textTheme = GoogleFonts.interTextTheme(
      isDark ? ThemeData.dark().textTheme : ThemeData.light().textTheme,
    );

    return ThemeData(
      useMaterial3: false,
      brightness: isDark ? Brightness.dark : Brightness.light,
      scaffoldBackgroundColor: cs.bg,
      fontFamily: GoogleFonts.inter().fontFamily,
      textTheme: textTheme,
      colorScheme: ColorScheme(
        brightness: isDark ? Brightness.dark : Brightness.light,
        primary: primaryColor,
        onPrimary: Colors.white,
        secondary: primaryColor,
        onSecondary: Colors.white,
        error: const Color(0xFFEF4444),
        onError: Colors.white,
        background: cs.bg,
        onBackground: cs.ink,
        surface: cs.surface,
        onSurface: cs.ink,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      dividerTheme: DividerThemeData(
        color: cs.line,
        thickness: 0.5,
      ),
      cardTheme: CardTheme(
        color: cs.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cs.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: cs.line, width: 0.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: cs.line, width: 0.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: primaryColor, width: 0.5),
        ),
      ),
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      extensions: [
        isDark ? AppColorScheme.dark() : AppColorScheme.light(),
      ],
    );
  }
}
