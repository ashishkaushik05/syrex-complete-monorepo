import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

enum AppButtonVariant { primary, soft, ghost, danger }
enum AppButtonSize { sm, md, lg }

class AppButton extends StatefulWidget {
  final String label;
  final VoidCallback? onTap;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final bool fullWidth;
  final IconData? icon;
  final bool loading;
  final AppThemeColors c;

  const AppButton({
    super.key,
    required this.label,
    required this.c,
    this.onTap,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.md,
    this.fullWidth = false,
    this.icon = null,
    this.loading = false,
  });

  @override
  State<AppButton> createState() => _AppButtonState();
}

class _AppButtonState extends State<AppButton> {
  bool _pressed = false;

  EdgeInsetsGeometry get _padding {
    switch (widget.size) {
      case AppButtonSize.sm:
        return const EdgeInsets.symmetric(horizontal: 14, vertical: 9);
      case AppButtonSize.lg:
        return const EdgeInsets.symmetric(horizontal: 22, vertical: 15);
      case AppButtonSize.md:
        return const EdgeInsets.symmetric(horizontal: 18, vertical: 12);
    }
  }

  double get _fontSize => widget.size == AppButtonSize.lg ? 16 : 14.5;

  ({Color bg, Color text, Color border}) get _style {
    final c = widget.c;
    switch (widget.variant) {
      case AppButtonVariant.primary:
        return (bg: c.accent, text: c.accentText, border: c.accent);
      case AppButtonVariant.soft:
        return (bg: c.accentSoft, text: c.accent, border: c.accentBorder);
      case AppButtonVariant.ghost:
        return (bg: Colors.transparent, text: c.text, border: c.lineStrong);
      case AppButtonVariant.danger:
        return (bg: c.redSoft, text: c.redText, border: c.red.withOpacity(0.2));
    }
  }

  @override
  Widget build(BuildContext context) {
    final style = _style;
    final disabled = widget.onTap == null || widget.loading;

    return GestureDetector(
      onTapDown: disabled ? null : (_) => setState(() => _pressed = true),
      onTapUp: disabled ? null : (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: disabled ? null : widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.975 : 1.0,
        duration: const Duration(milliseconds: 120),
        child: AnimatedOpacity(
          opacity: disabled ? 0.5 : 1.0,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: widget.fullWidth ? double.infinity : null,
            padding: _padding,
            decoration: BoxDecoration(
              color: style.bg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: style.border),
              boxShadow: widget.variant == AppButtonVariant.primary ? [widget.c.shadow] : [],
            ),
            child: Row(
              mainAxisSize: widget.fullWidth ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (widget.loading)
                  SizedBox(
                    width: _fontSize, height: _fontSize,
                    child: CircularProgressIndicator(strokeWidth: 2, color: style.text),
                  )
                else ...[
                  if (widget.icon != null) ...[
                    Icon(widget.icon, size: _fontSize + 3, color: style.text),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    widget.label,
                    style: AppTextStyles.bodyHeavy(color: style.text).copyWith(
                      fontSize: _fontSize,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.1,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
