import 'package:flutter/material.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});

  final String status;

  static Color _color(String s) => switch (s) {
        'pending_approval' => Colors.orange,
        'approved' => Colors.blue,
        'partially_dispatched' => Colors.lightBlue,
        'fully_dispatched' => Colors.green,
        'rejected' => Colors.red,
        'cancelled' => Colors.grey,
        'on_hold' => Colors.amber,
        _ => Colors.grey,
      };

  static String _label(String s) =>
      s.replaceAll('_', ' ').split(' ').map((w) {
        if (w.isEmpty) return w;
        return w[0].toUpperCase() + w.substring(1);
      }).join(' ');

  @override
  Widget build(BuildContext context) {
    final color = _color(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(120)),
      ),
      child: Text(
        _label(status),
        style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}
