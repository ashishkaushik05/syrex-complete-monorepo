import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class QtyStepper extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChange;
  final int min;
  final AppThemeColors c;

  const QtyStepper({
    super.key,
    required this.value,
    required this.onChange,
    required this.c,
    this.min = 0,
  });

  @override
  Widget build(BuildContext context) {
    if (value <= 0) {
      return GestureDetector(
        onTap: () => onChange(1),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            color: c.accentSoft,
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: c.accentBorder),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.add, size: 16, color: c.accent),
              const SizedBox(width: 5),
              Text('Add', style: AppTextStyles.labelBold(color: c.accent)),
            ],
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: c.accentSoft,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: c.accentBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepBtn(icon: Icons.remove, c: c, onTap: () => onChange((value - 1).clamp(min, 999))),
          SizedBox(
            width: 26,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: AppTextStyles.bodyHeavy(color: c.text).copyWith(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                fontFeatures: [const FontFeature.tabularFigures()],
              ),
            ),
          ),
          _StepBtn(icon: Icons.add, c: c, onTap: () => onChange(value + 1)),
        ],
      ),
    );
  }
}

class _StepBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final AppThemeColors c;

  const _StepBtn({required this.icon, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(9),
          boxShadow: [c.shadow],
        ),
        child: Icon(icon, size: 16, color: c.accent),
      ),
    );
  }
}
