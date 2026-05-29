import 'package:flutter/material.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';

class RbRow extends StatelessWidget {
  const RbRow({
    super.key,
    required this.label,
    this.detail,
    this.leading,
    this.trailing,
    this.showChevron = true,
    this.onTap,
    this.showDivider = true,
  });

  final String label;
  final String? detail;
  final Widget? leading;
  final Widget? trailing;
  final bool showChevron;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    Widget row = Container(
      constraints: const BoxConstraints(minHeight: AppSpacing.rowH),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
      decoration: showDivider
          ? BoxDecoration(border: Border(bottom: BorderSide(color: cs.line, width: AppSpacing.hairline)))
          : null,
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 12)],
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 15,
                color: cs.ink,
                fontWeight: FontWeight.w400,
              ),
            ),
          ),
          if (detail != null) ...[
            const SizedBox(width: 8),
            Text(
              detail!,
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 13,
                color: cs.ink2,
              ),
            ),
          ],
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          if (showChevron) ...[
            const SizedBox(width: 4),
            RbIcon('chev-right', size: 14, color: cs.ink2),
          ],
        ],
      ),
    );

    if (onTap != null) {
      row = InkWell(onTap: onTap, child: row);
    }

    return row;
  }
}
