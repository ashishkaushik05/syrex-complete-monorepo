import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';

class RbToast extends StatelessWidget {
  const RbToast({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: cs.ink,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(color: Colors.black.withAlpha(50), blurRadius: 30, offset: const Offset(0, 10)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          RbIcon('check', size: 14, color: cs.accent),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              message,
              style: GoogleFonts.geist(fontSize: 13, fontWeight: FontWeight.w500, color: cs.bg),
            ),
          ),
        ],
      ),
    );
  }
}
