import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/models/dispatch.dart';
import 'status_badge.dart';

class DispatchListTile extends StatelessWidget {
  final DispatchDto dispatch;
  final VoidCallback onTap;
  final AppThemeColors c;
  final bool compact;

  const DispatchListTile({
    super.key,
    required this.dispatch,
    required this.onTap,
    required this.c,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final delivered = dispatch.deliveryStatus == 'delivered';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: c.line),
          boxShadow: [c.shadow],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    color: c.blueSoft,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(Icons.local_shipping_outlined, size: 21, color: c.blueText),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('#${dispatch.id.length > 8 ? dispatch.id.substring(0, 8) : dispatch.id}', style: AppTextStyles.dispatchTitle(color: c.text)),
                    ],
                  ),
                ),
                StatusBadge(status: dispatch.deliveryStatus, c: c),
              ],
            ),
            if (!compact) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  _MetaCol(label: 'Transporter', value: dispatch.transporterName, c: c),
                  const SizedBox(width: 18),
                  _MetaCol(label: 'Vehicle', value: dispatch.vehicleNumber, c: c),
                ],
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(
                  delivered ? Icons.check_circle_outline : Icons.schedule,
                  size: 15,
                  color: delivered ? c.green : c.blueText,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    '${delivered ? 'Delivered' : 'ETA'} ${dispatch.estimatedDelivery ?? dispatch.deliveredAt ?? '—'}',
                    style: AppTextStyles.smallLabel(color: c.textMute),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetaCol extends StatelessWidget {
  final String label;
  final String value;
  final AppThemeColors c;

  const _MetaCol({required this.label, required this.value, required this.c});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: AppTextStyles.caption(color: c.textFaint).copyWith(letterSpacing: 0.3)),
        const SizedBox(height: 2),
        Text(value, style: AppTextStyles.labelBold(color: c.text)),
      ],
    );
  }
}
