import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import 'app_button.dart';

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String sub;
  final String? actionLabel;
  final VoidCallback? onAction;
  final AppThemeColors c;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.sub,
    required this.c,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 60),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 64, height: 64,
            decoration: BoxDecoration(
              color: c.sunken,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(icon, size: 30, color: c.textFaint),
          ),
          const SizedBox(height: 12),
          Text(title, style: AppTextStyles.sectionTitle(color: c.text), textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(sub, style: AppTextStyles.label(color: c.textMute), textAlign: TextAlign.center),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 16),
            AppButton(label: actionLabel!, onTap: onAction, c: c),
          ],
        ],
      ),
    );
  }
}
