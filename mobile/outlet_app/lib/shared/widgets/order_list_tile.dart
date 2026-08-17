import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/models/order.dart';
import 'status_badge.dart';

class OrderListTile extends StatelessWidget {
  final OrderDto order;
  final VoidCallback onTap;
  final AppThemeColors c;

  const OrderListTile({super.key, required this.order, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
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
                Expanded(
                  child: Text(
                    '#${order.orderNumber}',
                    style: AppTextStyles.itemTitle(color: c.text),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                StatusBadge(status: _mapStatus(order.status), c: c),
              ],
            ),
            const SizedBox(height: 11),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(fmtDateStr(order.orderDate), style: AppTextStyles.smallLabel(color: c.textMute)),
                      const SizedBox(height: 3),
                      Text(
                        '${order.lines.length} ${order.lines.length == 1 ? 'product' : 'products'}',
                        style: AppTextStyles.smallLabel(color: c.textFaint),
                      ),
                    ],
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(fmtINR(parseAmount(order.totalValue)), style: AppTextStyles.amountMd(color: c.text)),
                    const SizedBox(width: 4),
                    Icon(Icons.chevron_right, size: 17, color: c.textFaint),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _mapStatus(String s) {
    if (s == 'pending_approval') return 'pending';
    if (s == 'fully_dispatched' || s == 'partially_dispatched') return 'dispatched';
    return s;
  }
}
