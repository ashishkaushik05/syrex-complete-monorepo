import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTextStyles {
  AppTextStyles._();

  static TextStyle get _base => GoogleFonts.plusJakartaSans();

  // ── Sizes (px → sp approximation, design uses px on 390pt canvas) ──
  static TextStyle caption({Color? color}) =>
      _base.copyWith(fontSize: 11, fontWeight: FontWeight.w600, color: color);

  static TextStyle smallLabel({Color? color}) =>
      _base.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600, color: color);

  static TextStyle smallLabelBold({Color? color}) =>
      _base.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, color: color);

  static TextStyle body({Color? color}) =>
      _base.copyWith(fontSize: 14, fontWeight: FontWeight.w500, color: color);

  static TextStyle bodyMed({Color? color}) =>
      _base.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: color);

  static TextStyle bodyBold({Color? color}) =>
      _base.copyWith(fontSize: 14, fontWeight: FontWeight.w700, color: color);

  static TextStyle bodyHeavy({Color? color}) =>
      _base.copyWith(fontSize: 14.5, fontWeight: FontWeight.w700, color: color);

  static TextStyle label({Color? color}) =>
      _base.copyWith(fontSize: 13.5, fontWeight: FontWeight.w600, color: color);

  static TextStyle labelBold({Color? color}) =>
      _base.copyWith(fontSize: 13.5, fontWeight: FontWeight.w700, color: color);

  static TextStyle labelHeavy({Color? color}) =>
      _base.copyWith(fontSize: 13.5, fontWeight: FontWeight.w800, color: color);

  static TextStyle sectionTitle({Color? color}) =>
      _base.copyWith(fontSize: 16.5, fontWeight: FontWeight.w800, letterSpacing: -0.2, color: color);

  static TextStyle screenTitle({Color? color}) =>
      _base.copyWith(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: color);

  static TextStyle screenTitleLarge({Color? color}) =>
      _base.copyWith(fontSize: 25, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: color);

  static TextStyle amountMd({Color? color}) =>
      _base.copyWith(fontSize: 17, fontWeight: FontWeight.w800, fontFeatures: [const FontFeature.tabularFigures()], color: color);

  static TextStyle amountLg({Color? color}) =>
      _base.copyWith(fontSize: 19, fontWeight: FontWeight.w800, fontFeatures: [const FontFeature.tabularFigures()], color: color);

  static TextStyle amountXl({Color? color}) =>
      _base.copyWith(fontSize: 22, fontWeight: FontWeight.w800, fontFeatures: [const FontFeature.tabularFigures()], color: color);

  static TextStyle amountHero({Color? color}) =>
      _base.copyWith(fontSize: 26, fontWeight: FontWeight.w800, fontFeatures: [const FontFeature.tabularFigures()], color: color);

  static TextStyle balanceBanner({Color? color}) =>
      _base.copyWith(fontSize: 33, fontWeight: FontWeight.w800, letterSpacing: -0.6, fontFeatures: [const FontFeature.tabularFigures()], color: color);

  static TextStyle badge({Color? color}) =>
      _base.copyWith(fontSize: 12.5, fontWeight: FontWeight.w700, letterSpacing: 0.1, color: color);

  static TextStyle chip({Color? color}) =>
      _base.copyWith(fontSize: 13.5, fontWeight: FontWeight.w600, color: color);

  static TextStyle tabLabel({Color? color}) =>
      _base.copyWith(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.1, color: color);

  static TextStyle tabLabelActive({Color? color}) =>
      _base.copyWith(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.1, color: color);

  static TextStyle headingLg({Color? color}) =>
      _base.copyWith(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: color);

  static TextStyle headingXl({Color? color}) =>
      _base.copyWith(fontSize: 23, fontWeight: FontWeight.w800, letterSpacing: -0.4, color: color);

  static TextStyle statValue({Color? color}) =>
      _base.copyWith(fontSize: 22, fontWeight: FontWeight.w800, fontFeatures: [const FontFeature.tabularFigures()], color: color);

  static TextStyle itemTitle({Color? color}) =>
      _base.copyWith(fontSize: 15.5, fontWeight: FontWeight.w800, letterSpacing: -0.1, color: color);

  static TextStyle dispatchTitle({Color? color}) =>
      _base.copyWith(fontSize: 15, fontWeight: FontWeight.w800, color: color);

  static TextStyle mono({Color? color}) =>
      const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, fontFamily: 'monospace', color: Colors.transparent).copyWith(color: color);
}
