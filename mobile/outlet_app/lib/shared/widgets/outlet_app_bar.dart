import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class OutletAppBar extends StatelessWidget {
  final String title;
  final String? subtitle;
  final bool large;
  final bool showBack;
  final VoidCallback? onBack;
  final Widget? trailing;
  final AppThemeColors c;

  const OutletAppBar({
    super.key,
    required this.title,
    required this.c,
    this.subtitle,
    this.large = false,
    this.showBack = false,
    this.onBack,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: c.bg,
      padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 12, 18, 12),
      child: Row(
        children: [
          if (showBack) ...[
            GestureDetector(
              onTap: onBack ?? () => Navigator.of(context).pop(),
              child: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: c.line),
                  boxShadow: [c.shadow],
                ),
                child: Icon(Icons.chevron_left, size: 22, color: c.text),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: AppTextStyles.smallLabelBold(color: c.accent).copyWith(letterSpacing: 0.2),
                  ),
                Text(
                  title,
                  style: large
                      ? AppTextStyles.screenTitleLarge(color: c.text)
                      : AppTextStyles.screenTitle(color: c.text),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 8),
            trailing!,
          ],
        ],
      ),
    );
  }
}
