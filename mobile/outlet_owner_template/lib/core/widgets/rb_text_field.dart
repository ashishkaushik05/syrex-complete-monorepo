import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';

class RbTextField extends StatelessWidget {
  const RbTextField({
    super.key,
    this.controller,
    this.placeholder,
    this.label,
    this.obscureText = false,
    this.keyboardType,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.enabled = true,
    this.suffix,
    this.prefix,
  });

  final TextEditingController? controller;
  final String? placeholder;
  final String? label;
  final bool obscureText;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final bool enabled;
  final Widget? suffix;
  final Widget? prefix;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Text(
            label!,
            style: GoogleFonts.geist(fontSize: 13, fontWeight: FontWeight.w500, color: cs.ink2),
          ),
          const SizedBox(height: 6),
        ],
        TextField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          autofocus: autofocus,
          enabled: enabled,
          style: GoogleFonts.geist(fontSize: 15, color: cs.ink),
          decoration: InputDecoration(
            hintText: placeholder,
            hintStyle: GoogleFonts.geist(fontSize: 15, color: cs.ink2),
            filled: true,
            fillColor: cs.surface,
            prefixIcon: prefix,
            suffixIcon: suffix,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
              borderSide: BorderSide(color: cs.accent, width: 1.5),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: cs.line, width: 0.5),
            ),
          ),
        ),
      ],
    );
  }
}
