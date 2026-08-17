import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

Future<T?> showAppSheet<T>({
  required BuildContext context,
  required AppThemeColors c,
  required Widget child,
  double maxHeightFraction = 0.86,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0x6B14120E),
    builder: (_) => _AppSheet(c: c, maxHeightFraction: maxHeightFraction, child: child),
  );
}

class _AppSheet extends StatelessWidget {
  final AppThemeColors c;
  final Widget child;
  final double maxHeightFraction;

  const _AppSheet({required this.c, required this.child, required this.maxHeightFraction});

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.of(context).size.height * maxHeightFraction;
    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [c.shadowLg],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 40, height: 5,
              decoration: BoxDecoration(
                color: c.lineStrong,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          Flexible(child: child),
        ],
      ),
    );
  }
}
