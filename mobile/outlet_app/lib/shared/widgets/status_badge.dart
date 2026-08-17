import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final String? label;
  final AppThemeColors c;

  const StatusBadge({super.key, required this.status, required this.c, this.label});

  @override
  Widget build(BuildContext context) {
    final m = c.status(status);
    final text = label ?? c.statusLabel(status);
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 5, 10, 5),
      decoration: BoxDecoration(
        color: m.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7, height: 7,
            decoration: BoxDecoration(color: m.dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(text, style: AppTextStyles.badge(color: m.fg), maxLines: 1),
        ],
      ),
    );
  }
}
