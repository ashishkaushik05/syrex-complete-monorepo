import 'package:flutter/material.dart';

/// AppColors holds raw hex color constants (theme-independent).
/// Use AppColorScheme (via Theme.of(context).extension<AppColorScheme>())
/// for semantic tokens that respond to light/dark theme.
class AppColors {
  AppColors._();

  // Semantic brand colors (theme-independent)
  static const Color accent = Color(0xFF6366F1);
  static const Color warn = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF6366F1);
  static const Color success = Color(0xFF10B981);
}

/// AppColorScheme is a ThemeExtension that provides all semantic color tokens.
/// Retrieved via: Theme.of(context).extension<AppColorScheme>()
/// Includes light and dark theme factories.
class AppColorScheme extends ThemeExtension<AppColorScheme> {
  final Color bg;
  final Color surface;
  final Color surface2;
  final Color surface3;
  final Color ink;
  final Color ink2;
  final Color muted;
  final Color muted2;
  final Color line;
  final Color line2;
  final Color lineStrong;
  final Color accent;
  final Color accentInk;
  final Color accentSoft;
  final Color accentLine;
  final Color warn;
  final Color warnSoft;
  final Color danger;
  final Color dangerSoft;
  final Color info;
  final Color infoSoft;
  final Color success;
  final Color successSoft;

  const AppColorScheme({
    required this.bg,
    required this.surface,
    required this.surface2,
    required this.surface3,
    required this.ink,
    required this.ink2,
    required this.muted,
    required this.muted2,
    required this.line,
    required this.line2,
    required this.lineStrong,
    required this.accent,
    required this.accentInk,
    required this.accentSoft,
    required this.accentLine,
    required this.warn,
    required this.warnSoft,
    required this.danger,
    required this.dangerSoft,
    required this.info,
    required this.infoSoft,
    required this.success,
    required this.successSoft,
  });

  /// Light theme with Routebook design tokens
  factory AppColorScheme.light() {
    return AppColorScheme(
      bg: const Color(0xFFFAFAF9),
      surface: const Color(0xFFFFFFFF),
      surface2: const Color(0xFFF3F3F1),
      surface3: const Color(0xFFE4E4E7),
      ink: const Color(0xFF09090B),
      ink2: const Color(0xFF3F3F46),
      muted: const Color(0xFF71717A),
      muted2: const Color(0xFFA1A1AA),
      line: const Color(0xFFF3F3F1),
      line2: const Color(0xFFD4D4D8),
      lineStrong: const Color(0xFF71717A),
      accent: const Color(0xFF6366F1),
      accentInk: const Color(0xFFFFFFFF),
      accentSoft: const Color(0xFFEEF2FF),
      accentLine: const Color(0xFFC7D2FE),
      warn: const Color(0xFFF59E0B),
      warnSoft: const Color(0xFFFEF3C7),
      danger: const Color(0xFFEF4444),
      dangerSoft: const Color(0xFFFFE4E6),
      info: const Color(0xFF6366F1),
      infoSoft: const Color(0xFFEEF2FF),
      success: const Color(0xFF10B981),
      successSoft: const Color(0xFFECFDF5),
    );
  }

  /// Dark theme with Routebook design tokens
  factory AppColorScheme.dark() {
    return AppColorScheme(
      bg: const Color(0xFF09090B),
      surface: const Color(0xFF18181B),
      surface2: const Color(0xFF27272A),
      surface3: const Color(0xFF3F3F46),
      ink: const Color(0xFFFAFAF9),
      ink2: const Color(0xFFA1A1AA),
      muted: const Color(0xFFA1A1AA),
      muted2: const Color(0xFF71717A),
      line: const Color(0xFF27272A),
      line2: const Color(0xFF3F3F46),
      lineStrong: const Color(0xFF52525B),
      accent: const Color(0xFF6366F1),
      accentInk: const Color(0xFFFFFFFF),
      accentSoft: const Color(0x2E6366F1),
      accentLine: const Color(0x596366F1),
      warn: const Color(0xFFF59E0B),
      warnSoft: const Color(0x29F59E0B),
      danger: const Color(0xFFEF4444),
      dangerSoft: const Color(0x2EEF4444),
      info: const Color(0xFF6366F1),
      infoSoft: const Color(0x2E6366F1),
      success: const Color(0xFF10B981),
      successSoft: const Color(0x2910B981),
    );
  }

  @override
  AppColorScheme copyWith({
    Color? bg,
    Color? surface,
    Color? surface2,
    Color? surface3,
    Color? ink,
    Color? ink2,
    Color? muted,
    Color? muted2,
    Color? line,
    Color? line2,
    Color? lineStrong,
    Color? accent,
    Color? accentInk,
    Color? accentSoft,
    Color? accentLine,
    Color? warn,
    Color? warnSoft,
    Color? danger,
    Color? dangerSoft,
    Color? info,
    Color? infoSoft,
    Color? success,
    Color? successSoft,
  }) {
    return AppColorScheme(
      bg: bg ?? this.bg,
      surface: surface ?? this.surface,
      surface2: surface2 ?? this.surface2,
      surface3: surface3 ?? this.surface3,
      ink: ink ?? this.ink,
      ink2: ink2 ?? this.ink2,
      muted: muted ?? this.muted,
      muted2: muted2 ?? this.muted2,
      line: line ?? this.line,
      line2: line2 ?? this.line2,
      lineStrong: lineStrong ?? this.lineStrong,
      accent: accent ?? this.accent,
      accentInk: accentInk ?? this.accentInk,
      accentSoft: accentSoft ?? this.accentSoft,
      accentLine: accentLine ?? this.accentLine,
      warn: warn ?? this.warn,
      warnSoft: warnSoft ?? this.warnSoft,
      danger: danger ?? this.danger,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      info: info ?? this.info,
      infoSoft: infoSoft ?? this.infoSoft,
      success: success ?? this.success,
      successSoft: successSoft ?? this.successSoft,
    );
  }

  @override
  AppColorScheme lerp(ThemeExtension<AppColorScheme>? other, double t) {
    if (other is! AppColorScheme) {
      return this;
    }
    return AppColorScheme(
      bg: Color.lerp(bg, other.bg, t) ?? bg,
      surface: Color.lerp(surface, other.surface, t) ?? surface,
      surface2: Color.lerp(surface2, other.surface2, t) ?? surface2,
      surface3: Color.lerp(surface3, other.surface3, t) ?? surface3,
      ink: Color.lerp(ink, other.ink, t) ?? ink,
      ink2: Color.lerp(ink2, other.ink2, t) ?? ink2,
      muted: Color.lerp(muted, other.muted, t) ?? muted,
      muted2: Color.lerp(muted2, other.muted2, t) ?? muted2,
      line: Color.lerp(line, other.line, t) ?? line,
      line2: Color.lerp(line2, other.line2, t) ?? line2,
      lineStrong: Color.lerp(lineStrong, other.lineStrong, t) ?? lineStrong,
      accent: Color.lerp(accent, other.accent, t) ?? accent,
      accentInk: Color.lerp(accentInk, other.accentInk, t) ?? accentInk,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t) ?? accentSoft,
      accentLine: Color.lerp(accentLine, other.accentLine, t) ?? accentLine,
      warn: Color.lerp(warn, other.warn, t) ?? warn,
      warnSoft: Color.lerp(warnSoft, other.warnSoft, t) ?? warnSoft,
      danger: Color.lerp(danger, other.danger, t) ?? danger,
      dangerSoft: Color.lerp(dangerSoft, other.dangerSoft, t) ?? dangerSoft,
      info: Color.lerp(info, other.info, t) ?? info,
      infoSoft: Color.lerp(infoSoft, other.infoSoft, t) ?? infoSoft,
      success: Color.lerp(success, other.success, t) ?? success,
      successSoft: Color.lerp(successSoft, other.successSoft, t) ?? successSoft,
    );
  }
}
