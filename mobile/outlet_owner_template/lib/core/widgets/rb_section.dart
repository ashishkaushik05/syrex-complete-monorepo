import 'package:flutter/material.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';

class RbSection extends StatelessWidget {
  const RbSection({
    super.key,
    required this.label,
    required this.child,
    this.padded = false,
  });

  final String label;
  final Widget child;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: padded
              ? const EdgeInsets.fromLTRB(AppSpacing.pad, 20, AppSpacing.pad, 8)
              : const EdgeInsets.fromLTRB(0, 20, 0, 8),
          child: Text(
            label.toUpperCase(),
            style: TextStyle(
              fontFamily: 'Geist',
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: cs.ink2,
              letterSpacing: 0.06,
            ),
          ),
        ),
        padded
            ? Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                child: child,
              )
            : child,
      ],
    );
  }
}
