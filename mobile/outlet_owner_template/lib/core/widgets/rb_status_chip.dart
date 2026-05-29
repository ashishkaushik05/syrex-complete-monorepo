import 'package:flutter/material.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';

/// Status metadata entry
class RbStatusMeta {
  const RbStatusMeta({
    required this.label,
    required this.color,
    required this.bgColor,
  });
  final String label;
  final Color color;
  final Color bgColor;
}

class RbStatusChip extends StatelessWidget {
  const RbStatusChip({
    super.key,
    required this.status,
    required this.statusMap,
  });

  final String status;
  final Map<String, RbStatusMeta> statusMap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final meta = statusMap[status];
    final label = meta?.label ?? status;
    final fg = meta?.color ?? cs.ink2;
    final bg = meta?.bgColor ?? cs.surface2;

    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
      ),
      child: Center(
        child: Text(
          label.toUpperCase(),
          style: TextStyle(
            fontFamily: 'Geist',
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: fg,
            letterSpacing: 0.06,
          ),
        ),
      ),
    );
  }
}
