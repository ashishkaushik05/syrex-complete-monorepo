import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Routebook design-system color tokens.
/// Light-mode constants; dark variants live in [RbColorsDark].
class RbColors {
  // Backgrounds
  static const bg = Color(0xFFFAFAF9);
  static const surface = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFF4F4F5);
  static const surface3 = Color(0xFFE4E4E7);

  // Text
  static const ink = Color(0xFF09090B);
  static const ink2 = Color(0xFF3F3F46);
  static const muted = Color(0xFF71717A);
  static const muted2 = Color(0xFFA1A1AA);

  // Borders
  static const line = Color(0xFFE4E4E7);
  static const line2 = Color(0xFFD4D4D8);
  static const lineStrong = Color(0xFF71717A);

  // Accent (emerald)
  static const accent = Color(0xFF10B981);
  static const accentInk = Color(0xFFFFFFFF);
  static const accentSoft = Color(0xFFECFDF5);
  static const accentLine = Color(0xFFA7F3D0);

  // Semantic
  static const warn = Color(0xFFF59E0B);
  static const warnSoft = Color(0xFFFEF3C7);
  static const danger = Color(0xFFE11D48);
  static const dangerSoft = Color(0xFFFFE4E6);
  static const info = Color(0xFF6366F1);
  static const infoSoft = Color(0xFFEEF2FF);
  static const success = Color(0xFF10B981);
  static const successSoft = Color(0xFFECFDF5);
}

class RbColorsDark {
  static const bg = Color(0xFF09090B);
  static const surface = Color(0xFF18181B);
  static const surface2 = Color(0xFF27272A);
  static const surface3 = Color(0xFF3F3F46);
  static const ink = Color(0xFFFAFAFA);
  static const ink2 = Color(0xFFE4E4E7);
  static const muted = Color(0xFFA1A1AA);
  static const muted2 = Color(0xFF71717A);
  static const line = Color(0xFF27272A);
  static const line2 = Color(0xFF3F3F46);

  static const accentSoft = Color(0x2310B981);
  static const accentLine = Color(0x5910B981);
  static const warnSoft = Color(0x29F59E0B);
  static const dangerSoft = Color(0x2EE11D48);
  static const infoSoft = Color(0x2E6366F1);
  static const successSoft = Color(0x2910B981);
}

/// Helper so screens can call [RbColors.forTheme(isDark).bg] etc.
class RbThemeColors {
  const RbThemeColors({required this.isDark});
  final bool isDark;

  Color get bg => isDark ? RbColorsDark.bg : RbColors.bg;
  Color get surface => isDark ? RbColorsDark.surface : RbColors.surface;
  Color get surface2 => isDark ? RbColorsDark.surface2 : RbColors.surface2;
  Color get surface3 => isDark ? RbColorsDark.surface3 : RbColors.surface3;
  Color get ink => isDark ? RbColorsDark.ink : RbColors.ink;
  Color get ink2 => isDark ? RbColorsDark.ink2 : RbColors.ink2;
  Color get muted => isDark ? RbColorsDark.muted : RbColors.muted;
  Color get muted2 => isDark ? RbColorsDark.muted2 : RbColors.muted2;
  Color get line => isDark ? RbColorsDark.line : RbColors.line;
  Color get line2 => isDark ? RbColorsDark.line2 : RbColors.line2;
  Color get accentSoft => isDark ? RbColorsDark.accentSoft : RbColors.accentSoft;
  Color get accentLine => isDark ? RbColorsDark.accentLine : RbColors.accentLine;
  Color get warnSoft => isDark ? RbColorsDark.warnSoft : RbColors.warnSoft;
  Color get dangerSoft => isDark ? RbColorsDark.dangerSoft : RbColors.dangerSoft;
  Color get infoSoft => isDark ? RbColorsDark.infoSoft : RbColors.infoSoft;
  Color get successSoft => isDark ? RbColorsDark.successSoft : RbColors.successSoft;
}

TextTheme _buildTextTheme(TextTheme base) =>
    GoogleFonts.interTextTheme(base);

TextStyle rbMono([double size = 13, FontWeight weight = FontWeight.w400]) =>
    GoogleFonts.jetBrainsMono(
      fontSize: size,
      fontWeight: weight,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

class AppTheme {
  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final baseText = isDark ? ThemeData.dark().textTheme : ThemeData.light().textTheme;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: isDark ? RbColorsDark.bg : RbColors.bg,
      colorScheme: isDark
          ? ColorScheme.dark(
              primary: RbColors.accent,
              surface: RbColorsDark.surface,
              error: RbColors.danger,
              onPrimary: RbColors.accentInk,
              onSurface: RbColorsDark.ink,
            )
          : ColorScheme.light(
              primary: RbColors.accent,
              surface: RbColors.surface,
              error: RbColors.danger,
              onPrimary: RbColors.accentInk,
              onSurface: RbColors.ink,
            ),
      textTheme: _buildTextTheme(baseText),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        elevation: 0,
        color: isDark ? RbColorsDark.surface : RbColors.surface,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: isDark ? RbColorsDark.line : RbColors.line,
            width: 0.5,
          ),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: isDark ? RbColorsDark.line : RbColors.line,
        thickness: 0.5,
        space: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? RbColorsDark.surface : RbColors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(
            color: isDark ? RbColorsDark.line : RbColors.line,
            width: 0.5,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(
            color: isDark ? RbColorsDark.line : RbColors.line,
            width: 0.5,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(
            color: isDark ? RbColorsDark.ink : RbColors.ink,
            width: 1,
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    );
  }
}
