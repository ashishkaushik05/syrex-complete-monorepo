import 'package:flutter/material.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';

/// White card with 0.5px border, 12px radius. Matches rb-card CSS class.
class RbCard extends StatelessWidget {
  const RbCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.clipContent = false,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final bool clipContent;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    Widget card = Container(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radius),
        border: Border.all(color: cs.line, width: AppSpacing.hairline),
      ),
      clipBehavior: clipContent ? Clip.antiAlias : Clip.none,
      child: padding != null ? Padding(padding: padding!, child: child) : child,
    );

    if (onTap != null) {
      card = Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppSpacing.radius),
          child: card,
        ),
      );
    }

    return card;
  }
}
