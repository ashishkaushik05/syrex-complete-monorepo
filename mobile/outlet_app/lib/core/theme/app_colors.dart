import 'package:flutter/material.dart';

// Design token colours extracted from theme.jsx
class AppColors {
  AppColors._();

  // ── Accent ─────────────────────────────────────────────────
  static const accent = Color(0xFF0E7C5A);
  static const accentText = Color(0xFFFFFFFF);
  static Color accentSoft(bool dark) =>
      dark ? const Color(0xFF0E7C5A).withOpacity(0.18) : const Color(0xFF0E7C5A).withOpacity(0.10);
  static Color accentBorder(bool dark) =>
      dark ? const Color(0xFF0E7C5A).withOpacity(0.40) : const Color(0xFF0E7C5A).withOpacity(0.22);

  // ── Background / Surface ───────────────────────────────────
  static const bgLight = Color(0xFFF5F3EE);
  static const bgDark = Color(0xFF101311);

  static const surfaceLight = Color(0xFFFFFFFF);
  static const surfaceDark = Color(0xFF191D1A);

  static const surface2Light = Color(0xFFFBFAF6);
  static const surface2Dark = Color(0xFF1F2420);

  static const sunkenLight = Color(0xFFEFEDE6);
  static const sunkenDark = Color(0xFF14180F);

  // ── Lines ──────────────────────────────────────────────────
  static const lineLight = Color(0xFFEBE8DF);
  static Color lineDark = const Color(0xFFFFFFFF).withOpacity(0.085);

  static const lineStrongLight = Color(0xFFDEDACE);
  static Color lineStrongDark = const Color(0xFFFFFFFF).withOpacity(0.16);

  // ── Text ──────────────────────────────────────────────────
  static const textLight = Color(0xFF211F1A);
  static const textDark = Color(0xFFF3F2EC);

  static const textMuteLight = Color(0xFF736E64);
  static const textMuteDark = Color(0xFF9B9C92);

  static const textFaintLight = Color(0xFFA39D90);
  static const textFaintDark = Color(0xFF6E6F66);

  // ── Semantic ───────────────────────────────────────────────
  // Amber
  static const amberLight = Color(0xFFB9760F);
  static const amberSoftLight = Color(0xFFFBEFD9);
  static const amberTextLight = Color(0xFF92590A);
  static const amberDark = Color(0xFFE0A33B);
  static Color amberSoftDark = const Color(0xFFE0A33B).withOpacity(0.16);
  static const amberTextDark = Color(0xFFF0C173);

  // Red
  static const redLight = Color(0xFFC24338);
  static const redSoftLight = Color(0xFFFAE6E2);
  static const redTextLight = Color(0xFF9C322A);
  static const redDark = Color(0xFFE8675B);
  static Color redSoftDark = const Color(0xFFE8675B).withOpacity(0.16);
  static const redTextDark = Color(0xFFF19389);

  // Blue
  static const blueLight = Color(0xFF2C6BB0);
  static const blueSoftLight = Color(0xFFE6EEF8);
  static const blueTextLight = Color(0xFF214F82);
  static const blueDark = Color(0xFF5C9FE0);
  static Color blueSoftDark = const Color(0xFF5C9FE0).withOpacity(0.16);
  static const blueTextDark = Color(0xFF92BEEC);

  // Green (same as accent)
  static Color greenSoftLight = const Color(0xFF0E7C5A).withOpacity(0.10);
  static Color greenSoftDark = const Color(0xFF0E7C5A).withOpacity(0.18);
  static const greenTextLight = Color(0xFF0C6B4E); // darken(accent, 0.12)
  static const greenTextDark = Color(0xFF7ECFB0); // lighten(accent, 0.45)
}

// ── Theme-aware colour accessor ────────────────────────────────
class AppThemeColors {
  final bool dark;
  const AppThemeColors({required this.dark});

  Color get bg => dark ? AppColors.bgDark : AppColors.bgLight;
  Color get surface => dark ? AppColors.surfaceDark : AppColors.surfaceLight;
  Color get surface2 => dark ? AppColors.surface2Dark : AppColors.surface2Light;
  Color get sunken => dark ? AppColors.sunkenDark : AppColors.sunkenLight;
  Color get line => dark ? AppColors.lineDark : AppColors.lineLight;
  Color get lineStrong => dark ? AppColors.lineStrongDark : AppColors.lineStrongLight;
  Color get text => dark ? AppColors.textDark : AppColors.textLight;
  Color get textMute => dark ? AppColors.textMuteDark : AppColors.textMuteLight;
  Color get textFaint => dark ? AppColors.textFaintDark : AppColors.textFaintLight;

  Color get accent => AppColors.accent;
  Color get accentText => AppColors.accentText;
  Color get accentSoft => AppColors.accentSoft(dark);
  Color get accentBorder => AppColors.accentBorder(dark);

  Color get amber => dark ? AppColors.amberDark : AppColors.amberLight;
  Color get amberSoft => dark ? AppColors.amberSoftDark : AppColors.amberSoftLight;
  Color get amberText => dark ? AppColors.amberTextDark : AppColors.amberTextLight;

  Color get red => dark ? AppColors.redDark : AppColors.redLight;
  Color get redSoft => dark ? AppColors.redSoftDark : AppColors.redSoftLight;
  Color get redText => dark ? AppColors.redTextDark : AppColors.redTextLight;

  Color get blue => dark ? AppColors.blueDark : AppColors.blueLight;
  Color get blueSoft => dark ? AppColors.blueSoftDark : AppColors.blueSoftLight;
  Color get blueText => dark ? AppColors.blueTextDark : AppColors.blueTextLight;

  Color get green => AppColors.accent;
  Color get greenSoft => dark ? AppColors.greenSoftDark : AppColors.greenSoftLight;
  Color get greenText => dark ? AppColors.greenTextDark : AppColors.greenTextLight;

  // Status colour map
  ({Color fg, Color bg, Color dot}) status(String s) {
    switch (s) {
      case 'pending':
        return (fg: amberText, bg: amberSoft, dot: amber);
      case 'approved':
        return (fg: greenText, bg: greenSoft, dot: green);
      case 'dispatched':
      case 'in_transit':
        return (fg: blueText, bg: blueSoft, dot: blue);
      case 'delivered':
        return (fg: greenText, bg: greenSoft, dot: green);
      case 'cancelled':
        return (fg: textMute, bg: sunken, dot: textFaint);
      case 'paid':
        return (fg: greenText, bg: greenSoft, dot: green);
      case 'unpaid':
        return (fg: amberText, bg: amberSoft, dot: amber);
      case 'overdue':
        return (fg: redText, bg: redSoft, dot: red);
      case 'raised':
        return (fg: textMute, bg: sunken, dot: textFaint);
      case 'assigned':
        return (fg: blueText, bg: blueSoft, dot: blue);
      case 'visit':
        return (fg: amberText, bg: amberSoft, dot: amber);
      case 'resolved':
        return (fg: greenText, bg: greenSoft, dot: green);
      default:
        return (fg: textMute, bg: sunken, dot: textFaint);
    }
  }

  String statusLabel(String s) {
    switch (s) {
      case 'pending':
        return 'Pending approval';
      case 'approved':
        return 'Approved';
      case 'dispatched':
        return 'Dispatched';
      case 'in_transit':
        return 'In transit';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      case 'paid':
        return 'Paid';
      case 'unpaid':
        return 'Unpaid';
      case 'overdue':
        return 'Overdue';
      case 'raised':
        return 'Raised';
      case 'assigned':
        return 'Assigned';
      case 'visit':
        return 'Visit scheduled';
      case 'test_result_submitted':
        return 'Test submitted';
      case 'resolved':
        return 'Resolved';
      case 'telephonic_closure':
        return 'Closed (telephonic)';
      case 'cancelled_complaint':
        return 'Cancelled';
      case 'on_hold':
        return 'On hold';
      case 'partially_dispatched':
        return 'Partially dispatched';
      case 'fully_dispatched':
        return 'Fully dispatched';
      case 'pending_approval':
        return 'Pending approval';
      case 'rejected':
        return 'Rejected';
      default:
        return s;
    }
  }

  BoxShadow get shadow => dark
      ? const BoxShadow(color: Color(0x66000000), blurRadius: 26, offset: Offset(0, 10), spreadRadius: -12)
      : BoxShadow(color: const Color(0xFF211F1A).withOpacity(0.14), blurRadius: 20, offset: const Offset(0, 8), spreadRadius: -10);

  BoxShadow get shadowLg => dark
      ? const BoxShadow(color: Color(0xBF000000), blurRadius: 50, offset: Offset(0, 18), spreadRadius: -12)
      : BoxShadow(color: const Color(0xFF211F1A).withOpacity(0.28), blurRadius: 60, offset: const Offset(0, 24), spreadRadius: -16);
}
