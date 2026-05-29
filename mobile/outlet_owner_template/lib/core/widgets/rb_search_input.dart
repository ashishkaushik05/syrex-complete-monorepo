import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';

class RbSearchInput extends StatelessWidget {
  const RbSearchInput({
    super.key,
    this.controller,
    this.placeholder = 'Search…',
    this.onChanged,
  });

  final TextEditingController? controller;
  final String placeholder;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return SizedBox(
      height: 40,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: GoogleFonts.geist(fontSize: 15, color: cs.ink),
        decoration: InputDecoration(
          hintText: placeholder,
          hintStyle: GoogleFonts.geist(fontSize: 15, color: cs.ink2),
          filled: true,
          fillColor: cs.surface2,
          prefixIcon: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: RbIcon('search', size: 16, color: cs.ink2),
          ),
          prefixIconConstraints: const BoxConstraints(minWidth: 40),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }
}
