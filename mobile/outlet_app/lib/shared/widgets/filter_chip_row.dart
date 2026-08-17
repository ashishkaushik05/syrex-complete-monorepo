import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class AppFilterChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  final AppThemeColors c;

  const AppFilterChip({
    super.key,
    required this.label,
    required this.active,
    required this.onTap,
    required this.c,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
        decoration: BoxDecoration(
          color: active ? c.accent : c.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: active ? c.accent : c.line),
          boxShadow: active ? [c.shadow] : [],
        ),
        child: Text(
          label,
          style: AppTextStyles.chip(color: active ? c.accentText : c.textMute),
          maxLines: 1,
        ),
      ),
    );
  }
}

class FilterChipRow extends StatelessWidget {
  final List<String> chips;
  final String selected;
  final ValueChanged<String> onSelect;
  final AppThemeColors c;

  const FilterChipRow({
    super.key,
    required this.chips,
    required this.selected,
    required this.onSelect,
    required this.c,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: EdgeInsets.zero,
      child: Row(
        children: chips.map((chip) {
          return Padding(
            padding: EdgeInsets.only(right: chips.last == chip ? 0 : 8),
            child: AppFilterChip(
              label: chip,
              active: selected == chip,
              onTap: () => onSelect(chip),
              c: c,
            ),
          );
        }).toList(),
      ),
    );
  }
}
