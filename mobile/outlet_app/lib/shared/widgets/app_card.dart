import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

class AppCard extends StatelessWidget {
  final AppThemeColors c;
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final BorderRadius? borderRadius;
  final Color? color;

  const AppCard({
    super.key,
    required this.c,
    required this.child,
    this.padding,
    this.onTap,
    this.borderRadius,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color ?? c.surface,
      borderRadius: borderRadius ?? BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius ?? BorderRadius.circular(20),
        child: Container(
          padding: padding ?? const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: borderRadius ?? BorderRadius.circular(20),
            border: Border.all(color: c.line),
            boxShadow: [c.shadow],
          ),
          child: child,
        ),
      ),
    );
  }
}
