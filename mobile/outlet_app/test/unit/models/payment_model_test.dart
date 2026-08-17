import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/payment.dart';

void main() {
  group('PaymentDto.fromJson', () {
    final fullJson = {
      'id': 'payment-uuid-001',
      'outletId': 'outlet-uuid-001',
      'amount': '15000.00',
      'paymentDate': '2026-06-01',
      'reference': 'CHQ-12345',
      'description': 'Monthly payment',
      'voidedAt': null,
      'voidReason': null,
      'createdAt': '2026-06-01T09:00:00Z',
    };

    test('parses all fields correctly', () {
      final payment = PaymentDto.fromJson(fullJson);
      expect(payment.id, equals('payment-uuid-001'));
      expect(payment.outletId, equals('outlet-uuid-001'));
      expect(payment.amount, equals('15000.00'));
      expect(payment.paymentDate, equals('2026-06-01'));
      expect(payment.reference, equals('CHQ-12345'));
      expect(payment.description, equals('Monthly payment'));
      expect(payment.voided, isFalse);
      expect(payment.voidReason, isNull);
      expect(payment.createdAt, equals('2026-06-01T09:00:00Z'));
    });

    test('voided is false when voidedAt is null', () {
      final json = {...fullJson, 'voidedAt': null};
      final payment = PaymentDto.fromJson(json);
      expect(payment.voided, isFalse);
    });

    test('voided is true when voidedAt is non-null timestamp', () {
      final json = {...fullJson, 'voidedAt': '2026-06-02T10:00:00Z'};
      final payment = PaymentDto.fromJson(json);
      expect(payment.voided, isTrue);
    });

    test('voided derived from voidedAt, not a direct bool field', () {
      // The JSON has no "voided" boolean field; it's derived from voidedAt
      final json = {...fullJson, 'voidedAt': '2026-06-02T10:00:00Z'};
      final payment = PaymentDto.fromJson(json);
      // voided should be true because voidedAt != null
      expect(payment.voided, isTrue);
    });

    test('reference is nullable when absent', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('reference');
      final payment = PaymentDto.fromJson(json);
      expect(payment.reference, isNull);
    });

    test('reference is nullable when JSON null', () {
      final json = {...fullJson, 'reference': null};
      final payment = PaymentDto.fromJson(json);
      expect(payment.reference, isNull);
    });

    test('amount accepts numeric JSON (toString coercion)', () {
      final json = {...fullJson, 'amount': 15000.0};
      final payment = PaymentDto.fromJson(json);
      expect(payment.amount, equals('15000.0'));
    });

    test('outletId absent defaults to empty string', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('outletId');
      final payment = PaymentDto.fromJson(json);
      expect(payment.outletId, equals(''));
    });

    test('outletId null defaults to empty string', () {
      final json = {...fullJson, 'outletId': null};
      final payment = PaymentDto.fromJson(json);
      expect(payment.outletId, equals(''));
    });

    test('voidReason present when voided', () {
      final json = {
        ...fullJson,
        'voidedAt': '2026-06-02T10:00:00Z',
        'voidReason': 'Duplicate entry',
      };
      final payment = PaymentDto.fromJson(json);
      expect(payment.voidReason, equals('Duplicate entry'));
    });
  });

  group('PagedPayments.fromJson', () {
    test('parses items and nextCursor', () {
      final json = {
        'items': [
          {
            'id': 'pay-001',
            'outletId': 'outlet-001',
            'amount': '5000',
            'paymentDate': '2026-06-01',
            'voidedAt': null,
          }
        ],
        'nextCursor': 'cursor-abc',
      };
      final paged = PagedPayments.fromJson(json);
      expect(paged.items, hasLength(1));
      expect(paged.nextCursor, equals('cursor-abc'));
    });

    test('items absent throws (no null guard per spec)', () {
      // Per spec: j['items'] is NOT null-guarded with ?? []
      final json = {'nextCursor': null};
      expect(() => PagedPayments.fromJson(json), throwsA(anything));
    });

    test('nextCursor nullable when absent', () {
      final json = {
        'items': [],
      };
      final paged = PagedPayments.fromJson(json);
      expect(paged.nextCursor, isNull);
    });

    test('empty items list is valid', () {
      final json = {'items': [], 'nextCursor': null};
      final paged = PagedPayments.fromJson(json);
      expect(paged.items, isEmpty);
    });
  });

  group('PaymentAllocation.fromJson', () {
    test('parses all fields correctly', () {
      final json = {
        'invoiceId': 'inv-uuid-001',
        'invoiceNumber': 'INV-2024-001',
        'amount': '5000.00',
      };
      final alloc = PaymentAllocation.fromJson(json);
      expect(alloc.invoiceId, equals('inv-uuid-001'));
      expect(alloc.invoiceNumber, equals('INV-2024-001'));
      expect(alloc.amount, equals('5000.00'));
    });

    test('invoiceNumber falls back to invoiceId when server omits it', () {
      // Per spec: if invoiceNumber is null, falls back to invoiceId
      final json = {
        'invoiceId': 'inv-uuid-001',
        'invoiceNumber': null,
        'amount': '5000.00',
      };
      final alloc = PaymentAllocation.fromJson(json);
      expect(alloc.invoiceNumber, equals('inv-uuid-001'));
    });

    test('invoiceNumber falls back to invoiceId when key absent', () {
      final json = {
        'invoiceId': 'inv-uuid-001',
        // invoiceNumber key absent
        'amount': '2500.00',
      };
      final alloc = PaymentAllocation.fromJson(json);
      expect(alloc.invoiceNumber, equals('inv-uuid-001'));
    });

    test('amount accepts numeric JSON (toString coercion)', () {
      final json = {
        'invoiceId': 'inv-001',
        'invoiceNumber': 'INV-001',
        'amount': 5000,
      };
      final alloc = PaymentAllocation.fromJson(json);
      expect(alloc.amount, equals('5000'));
    });
  });

  group('PaymentDetailDto.fromJson', () {
    final detailJson = {
      'id': 'payment-uuid-001',
      'outletId': 'outlet-uuid-001',
      'amount': '10000.00',
      'paymentDate': '2026-06-01',
      'reference': 'REF-001',
      'description': 'June installment',
      'voidedAt': null,
      'voidReason': null,
      'createdAt': '2026-06-01T09:00:00Z',
      'allocations': [
        {
          'invoiceId': 'inv-001',
          'invoiceNumber': 'INV-2024-001',
          'amount': '5000.00',
        },
        {
          'invoiceId': 'inv-002',
          'invoiceNumber': 'INV-2024-002',
          'amount': '5000.00',
        },
      ],
    };

    test('parses allocations list correctly', () {
      final detail = PaymentDetailDto.fromJson(detailJson);
      expect(detail.allocations, hasLength(2));
      expect(detail.allocations.first.invoiceNumber, equals('INV-2024-001'));
      expect(detail.allocations.last.invoiceNumber, equals('INV-2024-002'));
    });

    test('allocations absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(detailJson)..remove('allocations');
      final detail = PaymentDetailDto.fromJson(json);
      expect(detail.allocations, isEmpty);
    });

    test('allocations null defaults to empty list', () {
      final json = {...detailJson, 'allocations': null};
      final detail = PaymentDetailDto.fromJson(json);
      expect(detail.allocations, isEmpty);
    });

    test('voided derived from voidedAt in PaymentDetailDto too', () {
      final json = {...detailJson, 'voidedAt': '2026-06-03T10:00:00Z'};
      final detail = PaymentDetailDto.fromJson(json);
      expect(detail.voided, isTrue);
    });

    test('inherits all PaymentDto fields', () {
      final detail = PaymentDetailDto.fromJson(detailJson);
      expect(detail.id, equals('payment-uuid-001'));
      expect(detail.amount, equals('10000.00'));
      expect(detail.reference, equals('REF-001'));
    });

    test('invoiceNumber in allocation falls back to invoiceId', () {
      final json = {
        ...detailJson,
        'allocations': [
          {'invoiceId': 'inv-uuid-fallback', 'invoiceNumber': null, 'amount': '1000'},
        ],
      };
      final detail = PaymentDetailDto.fromJson(json);
      expect(detail.allocations.first.invoiceNumber, equals('inv-uuid-fallback'));
    });
  });
}
