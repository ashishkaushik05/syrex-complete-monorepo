import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class LinkPlaceholder extends StatelessWidget {
  final IconData icon;
  final String text;
  final AppThemeColors c;

  const LinkPlaceholder({super.key, required this.icon, required this.text, required this.c});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.lineStrong, style: BorderStyle.solid),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 19, color: c.textFaint),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text, style: AppTextStyles.label(color: c.textMute)),
          ),
        ],
      ),
    );
  }
}
