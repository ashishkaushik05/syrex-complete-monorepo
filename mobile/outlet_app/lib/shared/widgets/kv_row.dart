import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class KVRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final bool last;
  final AppThemeColors c;

  const KVRow({
    super.key,
    required this.label,
    required this.value,
    required this.c,
    this.valueColor,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: c.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: AppTextStyles.label(color: c.textMute)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              style: AppTextStyles.bodyBold(color: valueColor ?? c.text).copyWith(
                fontFeatures: [const FontFeature.tabularFigures()],
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

// Divider row with total-style styling (used at bottom of bill summaries)
class KVTotalRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final AppThemeColors c;

  const KVTotalRow({
    super.key,
    required this.label,
    required this.value,
    required this.c,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(top: 13, bottom: 12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: c.line, width: 1.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: AppTextStyles.bodyHeavy(color: c.text).copyWith(fontSize: 15)),
          ),
          Text(
            value,
            style: AppTextStyles.amountLg(color: valueColor ?? c.accent),
          ),
        ],
      ),
    );
  }
}
