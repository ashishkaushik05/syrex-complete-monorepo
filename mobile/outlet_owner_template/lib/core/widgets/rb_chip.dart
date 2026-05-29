import 'package:flutter/material.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';

enum RbChipVariant { neutral, accent, danger, success }

class RbChip extends StatelessWidget {
  const RbChip({
    super.key,
    required this.label,
    this.variant = RbChipVariant.neutral,
    this.leading,
    this.mono = false,
  });

  final String label;
  final RbChipVariant variant;
  final Widget? leading;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    Color bg;
    Color fg;
    switch (variant) {
      case RbChipVariant.neutral:
        bg = cs.surface2;
        fg = cs.ink;
      case RbChipVariant.accent:
        bg = cs.accentSoft;
        fg = cs.accent;
      case RbChipVariant.danger:
        bg = Color.alphaBlend(cs.danger.withAlpha(26), cs.surface);
        fg = cs.danger;
      case RbChipVariant.success:
        bg = cs.successSoft;
        fg = cs.success;
    }

    final textStyle = TextStyle(
      fontFamily: mono ? 'GeistMono' : 'Geist',
      fontSize: mono ? 11 : 12,
      fontWeight: FontWeight.w500,
      color: fg,
    );

    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 4)],
          Text(label, style: textStyle),
        ],
      ),
    );
  }
}
