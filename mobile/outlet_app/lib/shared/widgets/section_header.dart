import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final AppThemeColors c;

  const SectionHeader({
    super.key,
    required this.title,
    required this.c,
    this.action,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(
              title,
              style: AppTextStyles.sectionTitle(color: c.text),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
          if (action != null && onAction != null) ...[
            const SizedBox(width: 12),
            GestureDetector(
              onTap: onAction,
              child: Text(
                action!,
                style: AppTextStyles.labelBold(color: c.accent),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
