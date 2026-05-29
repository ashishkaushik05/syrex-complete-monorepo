import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';

class RbTopBar extends StatelessWidget {
  const RbTopBar({
    super.key,
    this.title,
    this.subtitle,
    this.leading,
    this.actions = const [],
    this.frosted = false,
    this.titleWidget,
  });

  final String? title;
  final String? subtitle;
  final Widget? leading;
  final List<Widget> actions;
  final bool frosted;
  final Widget? titleWidget;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final topPad = MediaQuery.of(context).padding.top;

    Widget bar = Container(
      padding: EdgeInsets.fromLTRB(AppSpacing.pad, topPad + 12, AppSpacing.pad, 12),
      decoration: BoxDecoration(
        color: frosted ? cs.bg.withAlpha(230) : Colors.transparent,
        border: frosted ? Border(bottom: BorderSide(color: cs.line, width: AppSpacing.hairline)) : null,
      ),
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 12)],
          Expanded(
            child: titleWidget ??
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (title != null)
                      Text(
                        title!,
                        style: GoogleFonts.geist(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: cs.ink,
                          letterSpacing: -0.65,
                          height: 1.1,
                        ),
                      ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        style: GoogleFonts.geist(fontSize: 13, color: cs.ink2),
                      ),
                  ],
                ),
          ),
          ...actions,
        ],
      ),
    );

    if (frosted) {
      bar = ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: bar,
        ),
      );
    }

    return bar;
  }
}

/// Small icon button used in top bar actions
class RbIconButton extends StatelessWidget {
  const RbIconButton({
    super.key,
    required this.icon,
    this.onTap,
    this.color,
  });

  final String icon;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: cs.surface2,
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        ),
        child: Center(
          child: RbIcon(icon, size: 18, color: color ?? cs.ink),
        ),
      ),
    );
  }
}
