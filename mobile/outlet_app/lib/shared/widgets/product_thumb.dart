import 'package:flutter/material.dart';

// Product thumbnail with hue-based gradient + category glyph
// hue: 0–360, matches design's hsl-based gradient
class ProductThumb extends StatelessWidget {
  final int hue;
  final String category;
  final double size;
  final double radius;

  const ProductThumb({
    super.key,
    required this.hue,
    required this.category,
    this.size = 56,
    this.radius = 14,
  });

  static IconData _glyph(String cat) {
    switch (cat) {
      case 'Refrigerators':
        return Icons.kitchen;
      case 'Washing Machines':
        return Icons.local_laundry_service;
      case 'Air Conditioners':
        return Icons.ac_unit;
      case 'Televisions':
        return Icons.tv;
      default:
        return Icons.electrical_services;
    }
  }

  @override
  Widget build(BuildContext context) {
    final light = HSLColor.fromAHSL(1, hue.toDouble(), 0.62, 0.90).toColor();
    final mid = HSLColor.fromAHSL(1, hue.toDouble(), 0.55, 0.80).toColor();
    final iconColor = HSLColor.fromAHSL(1, hue.toDouble(), 0.45, 0.38).toColor();

    return Container(
      width: size, height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: const Alignment(-0.5, -0.8),
          end: const Alignment(0.8, 0.8),
          colors: [light, mid],
        ),
      ),
      child: Icon(_glyph(category), size: size * 0.46, color: iconColor),
    );
  }
}
