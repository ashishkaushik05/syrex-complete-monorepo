import 'package:intl/intl.dart';

// Indian number format: ₹1,23,456
String fmtINR(num amount, {bool paise = false}) {
  final neg = amount < 0;
  final v = amount.abs();
  final fmt = NumberFormat(paise ? '#,##,##,##0.00' : '#,##,##,##0', 'en_IN');
  return (neg ? '−₹' : '₹') + fmt.format(v);
}

// Compact: ₹1.25 L, ₹2.50 Cr
String fmtCompact(num amount) {
  final v = amount.abs();
  if (v >= 1e7) return '₹${(amount / 1e7).toStringAsFixed(2).replaceAll(RegExp(r'\.00$'), '')} Cr';
  if (v >= 1e5) return '₹${(amount / 1e5).toStringAsFixed(2).replaceAll(RegExp(r'\.00$'), '')} L';
  return fmtINR(amount);
}

// Date: "01 Jun 2026"
String fmtDate(DateTime dt) => DateFormat('dd MMM yyyy').format(dt);

// Short date: "01 Jun"
String fmtDateShort(DateTime dt) => DateFormat('dd MMM').format(dt);

// Relative date
String fmtRelative(DateTime dt) {
  final now = DateTime.now();
  final diff = now.difference(dt);
  if (diff.inSeconds < 60) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} hr ago';
  if (diff.inDays == 1) return 'Yesterday';
  if (diff.inDays < 7) return '${diff.inDays} days ago';
  return fmtDate(dt);
}

// Parse ISO string to DateTime safely
DateTime? tryParseDate(String? s) {
  if (s == null) return null;
  return DateTime.tryParse(s);
}

// Format ISO date string
String fmtDateStr(String? s, {String fallback = '—'}) {
  final dt = tryParseDate(s);
  return dt != null ? fmtDate(dt) : fallback;
}

// Parse decimal string (amounts come as strings from tRPC)
double parseAmount(dynamic v) {
  if (v == null) return 0.0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}
