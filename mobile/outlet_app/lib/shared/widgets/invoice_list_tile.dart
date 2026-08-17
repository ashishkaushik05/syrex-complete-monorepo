import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/models/invoice.dart';
import 'status_badge.dart';

class InvoiceListTile extends StatelessWidget {
  final InvoiceDto invoice;
  final VoidCallback onTap;
  final AppThemeColors c;

  const InvoiceListTile({super.key, required this.invoice, required this.onTap, required this.c});

  String get _status {
    final due = parseAmount(invoice.amountDue);
    if (due <= 0) return 'paid';
    final dueDate = tryParseDate(invoice.dueDate);
    if (dueDate != null && dueDate.isBefore(DateTime.now())) return 'overdue';
    return 'unpaid';
  }

  @override
  Widget build(BuildContext context) {
    final st = _status;
    final due = parseAmount(invoice.amountDue);
    final isOverdue = st == 'overdue';
    final isPaid = st == 'paid';

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
                  child: Text('#${invoice.invoiceNumber}', style: AppTextStyles.itemTitle(color: c.text), overflow: TextOverflow.ellipsis),
                ),
                StatusBadge(status: st, c: c),
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
                      Text('Issued ${fmtDateStr(invoice.invoiceDate)}', style: AppTextStyles.smallLabel(color: c.textMute)),
                      const SizedBox(height: 3),
                      Text(
                        isPaid ? 'Settled in full' : 'Due ${fmtDateStr(invoice.dueDate)}',
                        style: AppTextStyles.smallLabelBold(color: isOverdue ? c.red : c.textFaint),
                      ),
                    ],
                  ),
                ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      fmtINR(isPaid ? parseAmount(invoice.total) : due),
                      style: AppTextStyles.amountMd(color: c.text),
                    ),
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
}
