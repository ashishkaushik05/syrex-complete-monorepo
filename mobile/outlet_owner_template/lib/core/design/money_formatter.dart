/// Formats monetary amounts in Indian Rupees with optional compact notation.
///
/// Supports:
/// - Null/NaN handling → returns "—"
/// - Compact mode: crore (Cr), lakh (L), thousand (k) with suffix
/// - Full mode: Indian grouping (last 3 digits, then groups of 2)
/// - Negative numbers: "−" prefix (minus sign, not hyphen)
/// - Currency sign: "₹" by default
class MoneyFormatter {
  MoneyFormatter._();

  /// Formats a monetary amount with optional compact notation.
  ///
  /// Returns "—" if [amount] is null or NaN.
  ///
  /// If [compact] is true:
  /// - ≥ 1 Cr (10,000,000): displays with "Cr" suffix
  /// - ≥ 1 L (100,000): displays with "L" suffix
  /// - ≥ 1 k (1,000): displays with "k" suffix
  /// - Trailing zeros are stripped
  ///
  /// If [compact] is false (default):
  /// - Uses Indian grouping: last 3 digits, then groups of 2
  /// - Example: 248530 → "₹2,48,530"
  /// - Example with decimals: 248530.50 → "₹2,48,530.50" (when decimals: 2)
  ///
  /// [sign] defaults to "₹" but can be customized.
  /// [decimals] defaults to 0 for backward compatibility, but can be set to 2 for paise.
  ///
  /// Negative numbers are prefixed with "−" (minus, not hyphen).
  static String format(
    num? amount, {
    bool compact = false,
    String sign = '₹',
    int decimals = 0,
  }) {
    if (amount == null || amount.isNaN) {
      return '—';
    }

    final isNegative = amount < 0;
    final absAmount = amount.abs();

    if (compact) {
      return _formatCompact(absAmount, isNegative, sign);
    }

    return _formatFull(absAmount, isNegative, sign, decimals: decimals);
  }

  /// Formats with compact notation (Cr, L, k suffixes).
  static String _formatCompact(num absAmount, bool isNegative, String sign) {
    final negPrefix = isNegative ? '−' : '';

    // ≥ 1 Cr (10,000,000)
    if (absAmount >= 1e7) {
      final formatted = (absAmount / 1e7).toStringAsFixed(2);
      final stripped = _stripTrailingZeros(formatted);
      return '$negPrefix$sign${stripped}Cr';
    }

    // ≥ 1 L (100,000)
    if (absAmount >= 1e5) {
      final formatted = (absAmount / 1e5).toStringAsFixed(2);
      final stripped = _stripTrailingZeros(formatted);
      return '$negPrefix$sign${stripped}L';
    }

    // ≥ 1 k (1,000)
    if (absAmount >= 1e3) {
      final formatted = (absAmount / 1e3).toStringAsFixed(1);
      final stripped = _stripTrailingZeros(formatted);
      return '$negPrefix$sign${stripped}k';
    }

    // < 1000: return as-is (no suffix)
    final rounded = absAmount.round().toString();
    return '$negPrefix$sign$rounded';
  }

  /// Formats with full Indian grouping (last 3 digits, then groups of 2).
  static String _formatFull(num absAmount, bool isNegative, String sign, {int decimals = 0}) {
    final negPrefix = isNegative ? '−' : '';

    // Format with the specified decimal places
    final formatted = absAmount.toStringAsFixed(decimals);
    final parts = formatted.split('.');
    final intPart = parts[0];
    final decPart = decimals > 0 ? '.${parts[1]}' : '';

    if (intPart.length <= 3) {
      return '$negPrefix$sign$intPart$decPart';
    }

    // Split: last 3 digits of integer part and the rest
    final last3 = intPart.substring(intPart.length - 3);
    final rest = intPart.substring(0, intPart.length - 3);

    // Group the rest in pairs from the right: (\d{2})+(?!\d)
    final grouped = _groupPairs(rest);

    return '$negPrefix$sign$grouped,$last3$decPart';
  }

  /// Groups digits in pairs from right to left, separated by commas.
  /// Example: "1234" → "12,34"
  /// Example: "123456" → "1,23,456" (becomes "1,23,456," + last3 in full format)
  static String _groupPairs(String s) {
    if (s.isEmpty) return '';

    final result = <String>[];
    int count = 0;

    // Iterate from right to left
    for (int i = s.length - 1; i >= 0; i--) {
      if (count > 0 && count % 2 == 0) {
        result.insert(0, ',');
      }
      result.insert(0, s[i]);
      count++;
    }

    return result.join();
  }

  /// Strips trailing zeros and decimal point if needed.
  /// Example: "1.20" → "1.2"
  /// Example: "1.00" → "1"
  static String _stripTrailingZeros(String s) {
    if (!s.contains('.')) return s;

    // Remove trailing zeros
    s = s.replaceAll(RegExp(r'0+$'), '');

    // Remove trailing decimal point if no decimals remain
    s = s.replaceAll(RegExp(r'\.$'), '');

    return s;
  }
}
