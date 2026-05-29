import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTextStyles {
  AppTextStyles._();

  /// Heading 1: 26sp, Geist, w700, tight letter spacing
  static TextStyle h1(Color color) => GoogleFonts.geist(
        fontSize: 26,
        fontWeight: FontWeight.w700,
        color: color,
        letterSpacing: -0.65,
        height: 1.1,
      );

  /// Heading 2: 20sp, Geist, w600
  static TextStyle h2(Color color) => GoogleFonts.geist(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: -0.3,
      );

  /// Heading 3: 16sp, Geist, w600
  static TextStyle h3(Color color) => GoogleFonts.geist(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: -0.16,
      );

  /// Body text: 14sp, Geist, w400, comfortable line height
  static TextStyle body(Color color) => GoogleFonts.geist(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: color,
        height: 1.45,
      );

  /// Meta text: 12sp, Geist, w500 (secondary info)
  static TextStyle meta(Color color) => GoogleFonts.geist(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: color,
      );

  /// Section label: 11sp, Geist, w600, uppercase letter spacing
  /// Note: Caller applies .toUpperCase() at usage site
  static TextStyle sectionLabel(Color color) => GoogleFonts.geist(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: 0.88,
      );

  /// Chip label: 12sp, Geist, w500
  static TextStyle chip(Color color) => GoogleFonts.geist(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: color,
        letterSpacing: 0.11,
      );

  /// Money/financial text: variable size, GeistMono, tabular figures
  static TextStyle money(
    Color color, {
    double size = 16,
    FontWeight weight = FontWeight.w600,
  }) =>
      GoogleFonts.geistMono(
        fontSize: size,
        fontWeight: weight,
        color: color,
        letterSpacing: -0.015 * size,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  /// Monospace text: variable size, GeistMono (falls back to SourceCodePro), tabular figures
  static TextStyle mono(
    Color color, {
    double size = 13,
    FontWeight weight = FontWeight.w400,
  }) =>
      GoogleFonts.geistMono(
        fontSize: size,
        fontWeight: weight,
        color: color,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  /// Button label: 14sp, Geist, w600
  static TextStyle buttonLabel(
    Color color, {
    double size = 14,
  }) =>
      GoogleFonts.geist(
        fontSize: size,
        fontWeight: FontWeight.w600,
        color: color,
        letterSpacing: -0.15,
      );
}
