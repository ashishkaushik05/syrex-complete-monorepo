import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';

enum RbButtonVariant { primary, outline, ghost, danger }
enum RbButtonSize { regular, lg }

class RbButton extends StatelessWidget {
  const RbButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = RbButtonVariant.primary,
    this.size = RbButtonSize.regular,
    this.fullWidth = false,
    this.leading,
    this.isLoading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final RbButtonVariant variant;
  final RbButtonSize size;
  final bool fullWidth;
  final Widget? leading;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final height = size == RbButtonSize.lg ? AppSpacing.btnHLg : AppSpacing.btnH;

    Color bg;
    Color fg;
    Border? border;

    switch (variant) {
      case RbButtonVariant.primary:
        bg = cs.accent;
        fg = Colors.white;
        border = null;
      case RbButtonVariant.outline:
        bg = Colors.transparent;
        fg = cs.ink;
        border = Border.all(color: cs.line, width: AppSpacing.hairline);
      case RbButtonVariant.ghost:
        bg = Colors.transparent;
        fg = cs.ink;
        border = null;
      case RbButtonVariant.danger:
        bg = Colors.transparent;
        fg = cs.danger;
        border = Border.all(color: cs.danger.withAlpha(60), width: AppSpacing.hairline);
    }

    Widget content = Row(
      mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (isLoading)
          SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
        else ...[
          if (leading != null) ...[leading!, const SizedBox(width: 8)],
          Text(
            label,
            style: GoogleFonts.geist(fontSize: 14, fontWeight: FontWeight.w600, color: fg),
          ),
        ],
      ],
    );

    return SizedBox(
      height: height,
      width: fullWidth ? double.infinity : null,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm + 2), // 10px
        child: InkWell(
          onTap: isLoading ? null : onPressed,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: border,
            ),
            alignment: Alignment.center,
            child: content,
          ),
        ),
      ),
    );
  }
}
