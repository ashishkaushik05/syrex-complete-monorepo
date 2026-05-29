import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';

/// Circular avatar showing initials. Matches the design's Avatar component.
class RbAvatar extends StatelessWidget {
  const RbAvatar({
    super.key,
    required this.initials,
    this.size = 40,
    this.backgroundColor,
    this.textColor,
  });

  final String initials;
  final double size;
  final Color? backgroundColor;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final bg = backgroundColor ?? cs.ink;
    final fg = textColor ?? cs.bg;
    final fontSize = size * 0.35;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initials.toUpperCase(),
        style: GoogleFonts.geist(
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
          color: fg,
          letterSpacing: -0.02 * fontSize,
          height: 1,
        ),
      ),
    );
  }
}
