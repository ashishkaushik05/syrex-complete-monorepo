import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/utils/formatters.dart';

void main() {
  group('fmtINR', () {
    test('formats a normal positive integer amount', () {
      expect(fmtINR(123456), equals('₹1,23,456'));
    });

    test('formats zero as ₹0', () {
      expect(fmtINR(0), equals('₹0'));
    });

    test('formats zero with paise as ₹0.00', () {
      expect(fmtINR(0, paise: true), equals('₹0.00'));
    });

    test('formats a negative amount with Unicode minus sign', () {
      // Unicode minus U+2212, not hyphen U+002D
      final result = fmtINR(-5000);
      expect(result, startsWith('−₹'));
      expect(result, equals('−₹5,000'));
    });

    test('formats with paise (two decimal places)', () {
      expect(fmtINR(1234567.89, paise: true), equals('₹12,34,567.89'));
    });

    test('uses Indian lakh grouping for large numbers', () {
      expect(fmtINR(1234567), equals('₹12,34,567'));
    });

    test('formats crore-scale number with Indian grouping', () {
      // 10,000,000 → ₹1,00,00,000
      expect(fmtINR(10000000), equals('₹1,00,00,000'));
    });

    test('negative zero is treated as non-negative', () {
      // -0.0 < 0 is false in Dart, so prefix should be ₹
      final result = fmtINR(-0.0, paise: true);
      expect(result, startsWith('₹'));
      expect(result, equals('₹0.00'));
    });

    test('uses ₹ symbol (U+20B9), not Rs or INR', () {
      final result = fmtINR(100);
      expect(result, contains('₹'));
      expect(result, isNot(contains('Rs')));
      expect(result, isNot(contains('INR')));
    });

    test('negative sign is Unicode minus (U+2212), not hyphen (U+002D)', () {
      final result = fmtINR(-1);
      // Must contain Unicode minus, not ASCII hyphen at the prefix position
      expect(result[0], equals('−'));
    });
  });

  group('fmtCompact', () {
    test('formats a crore-scale value (>= 1e7)', () {
      expect(fmtCompact(25000000), equals('₹2.50 Cr'));
    });

    test('strips .00 suffix for exact crores', () {
      expect(fmtCompact(20000000), equals('₹2 Cr'));
    });

    test('formats exactly 1 crore', () {
      expect(fmtCompact(10000000), equals('₹1 Cr'));
    });

    test('formats a lakh-scale value (>= 1e5)', () {
      expect(fmtCompact(125000), equals('₹1.25 L'));
    });

    test('strips .00 suffix for exact lakhs', () {
      expect(fmtCompact(100000), equals('₹1 L'));
    });

    test('formats exactly 1 lakh boundary', () {
      expect(fmtCompact(100000), equals('₹1 L'));
    });

    test('formats value between 1 lakh and 1 crore as Lakh', () {
      expect(fmtCompact(5000000), equals('₹50 L'));
    });

    test('falls back to fmtINR for values below 1 lakh', () {
      expect(fmtCompact(99999), equals(fmtINR(99999)));
    });

    test('zero falls back to fmtINR', () {
      expect(fmtCompact(0), equals('₹0'));
    });

    test('negative crore uses plain minus (not Unicode minus)', () {
      final result = fmtCompact(-25000000);
      // fmtCompact uses amount/1e7 which preserves Dart's - sign (not Unicode minus)
      expect(result, contains('-2.50'));
      expect(result, endsWith(' Cr'));
    });

    test('negative lakh uses plain minus', () {
      final result = fmtCompact(-100000);
      expect(result, contains('-1'));
      expect(result, endsWith(' L'));
    });
  });

  group('fmtDate', () {
    test('formats June 6 2026 as "06 Jun 2026"', () {
      final dt = DateTime(2026, 6, 6);
      expect(fmtDate(dt), equals('06 Jun 2026'));
    });

    test('formats January 1 2024 as "01 Jan 2024"', () {
      final dt = DateTime(2024, 1, 1);
      expect(fmtDate(dt), equals('01 Jan 2024'));
    });

    test('zero-pads the day', () {
      final dt = DateTime(2025, 3, 5);
      expect(fmtDate(dt), startsWith('05'));
    });
  });

  group('fmtDateShort', () {
    test('formats June 6 2026 as "06 Jun"', () {
      final dt = DateTime(2026, 6, 6);
      expect(fmtDateShort(dt), equals('06 Jun'));
    });

    test('formats December 31 as "31 Dec"', () {
      final dt = DateTime(2026, 12, 31);
      expect(fmtDateShort(dt), equals('31 Dec'));
    });

    test('does not include year', () {
      final dt = DateTime(2026, 6, 6);
      expect(fmtDateShort(dt), isNot(contains('2026')));
    });
  });

  group('fmtRelative', () {
    test('returns "Just now" for 0 seconds ago', () {
      final dt = DateTime.now();
      expect(fmtRelative(dt), equals('Just now'));
    });

    test('returns "Just now" for 59 seconds ago', () {
      final dt = DateTime.now().subtract(const Duration(seconds: 59));
      expect(fmtRelative(dt), equals('Just now'));
    });

    test('returns "X min ago" for 1 minute ago', () {
      final dt = DateTime.now().subtract(const Duration(minutes: 1));
      expect(fmtRelative(dt), equals('1 min ago'));
    });

    test('returns "X min ago" for 59 minutes ago', () {
      final dt = DateTime.now().subtract(const Duration(minutes: 59));
      expect(fmtRelative(dt), equals('59 min ago'));
    });

    test('returns "X hr ago" for 1 hour ago', () {
      final dt = DateTime.now().subtract(const Duration(hours: 1));
      expect(fmtRelative(dt), equals('1 hr ago'));
    });

    test('returns "X hr ago" for 23 hours ago', () {
      final dt = DateTime.now().subtract(const Duration(hours: 23));
      expect(fmtRelative(dt), equals('23 hr ago'));
    });

    test('returns "Yesterday" for exactly 1 day ago', () {
      final dt = DateTime.now().subtract(const Duration(hours: 24));
      expect(fmtRelative(dt), equals('Yesterday'));
    });

    test('returns "X days ago" for 2 days ago', () {
      final dt = DateTime.now().subtract(const Duration(days: 2));
      expect(fmtRelative(dt), equals('2 days ago'));
    });

    test('returns "X days ago" for 6 days ago', () {
      final dt = DateTime.now().subtract(const Duration(days: 6));
      expect(fmtRelative(dt), equals('6 days ago'));
    });

    test('returns full date for 7 days ago (fallback to fmtDate)', () {
      final dt = DateTime.now().subtract(const Duration(days: 7));
      final result = fmtRelative(dt);
      // Should be a full formatted date like "DD MMM YYYY"
      expect(result, equals(fmtDate(dt)));
    });

    test('returns full date for dates older than 7 days', () {
      final dt = DateTime.now().subtract(const Duration(days: 30));
      expect(fmtRelative(dt), equals(fmtDate(dt)));
    });

    test('future date returns "Just now" (diff is negative, inSeconds < 60)', () {
      final dt = DateTime.now().add(const Duration(hours: 1));
      expect(fmtRelative(dt), equals('Just now'));
    });
  });

  group('parseAmount', () {
    test('null returns 0.0', () {
      expect(parseAmount(null), equals(0.0));
    });

    test('integer num returns double', () {
      expect(parseAmount(100), equals(100.0));
    });

    test('zero int returns 0.0', () {
      expect(parseAmount(0), equals(0.0));
    });

    test('double num returns double', () {
      expect(parseAmount(1234.56), equals(1234.56));
    });

    test('zero double returns 0.0', () {
      expect(parseAmount(0.0), equals(0.0));
    });

    test('valid decimal string returns double', () {
      expect(parseAmount('1234.56'), equals(1234.56));
    });

    test('string "0" returns 0.0', () {
      expect(parseAmount('0'), equals(0.0));
    });

    test('invalid string returns 0.0', () {
      expect(parseAmount('abc'), equals(0.0));
    });

    test('empty string returns 0.0', () {
      expect(parseAmount(''), equals(0.0));
    });

    test('the literal string "null" returns 0.0', () {
      expect(parseAmount('null'), equals(0.0));
    });

    test('negative decimal string returns negative double', () {
      expect(parseAmount('-500.25'), equals(-500.25));
    });

    test('bool value returns 0.0 (toString "true" fails parse)', () {
      expect(parseAmount(true), equals(0.0));
    });
  });

  group('fmtDateStr', () {
    test('valid ISO date string formats correctly', () {
      expect(fmtDateStr('2026-06-06'), equals('06 Jun 2026'));
    });

    test('null input returns em dash fallback', () {
      expect(fmtDateStr(null), equals('—'));
    });

    test('empty string returns em dash fallback', () {
      expect(fmtDateStr(''), equals('—'));
    });

    test('invalid string returns em dash fallback', () {
      expect(fmtDateStr('not-a-date'), equals('—'));
    });

    test('custom fallback is used when string is null', () {
      expect(fmtDateStr(null, fallback: 'N/A'), equals('N/A'));
    });

    test('valid datetime string formats to date', () {
      expect(fmtDateStr('2026-06-06T12:00:00Z'), equals('06 Jun 2026'));
    });
  });
}
