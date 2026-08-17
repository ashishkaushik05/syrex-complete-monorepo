import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/invoice.dart';
import 'package:outlet_app/core/utils/formatters.dart';

void main() {
  group('InvoiceDto.fromJson', () {
    final fullJson = {
      'id': 'inv-001',
      'invoiceNumber': 'INV-2024-001',
      'orderId': 'order-001',
      'outletId': 'outlet-001',
      'invoiceDate': '2024-06-01',
      'dueDate': '2024-07-01',
      'total': '5000.00',
      'amountPaid': '2000.00',
      'amountDue': '3000.00',
      'createdAt': '2024-06-01T08:00:00Z',
    };

    test('parses all fields correctly', () {
      final inv = InvoiceDto.fromJson(fullJson);
      expect(inv.id, equals('inv-001'));
      expect(inv.invoiceNumber, equals('INV-2024-001'));
      expect(inv.orderId, equals('order-001'));
      expect(inv.outletId, equals('outlet-001'));
      expect(inv.invoiceDate, equals('2024-06-01'));
      expect(inv.dueDate, equals('2024-07-01'));
      expect(inv.total, equals('5000.00'));
      expect(inv.amountPaid, equals('2000.00'));
      expect(inv.amountDue, equals('3000.00'));
      expect(inv.createdAt, equals('2024-06-01T08:00:00Z'));
    });

    test('monetary fields accept numeric JSON (toString coercion)', () {
      final json = {
        ...fullJson,
        'total': 5000.0,
        'amountPaid': 2000,
        'amountDue': 3000.0,
      };
      final inv = InvoiceDto.fromJson(json);
      expect(inv.total, equals('5000.0'));
      expect(inv.amountPaid, equals('2000'));
      expect(inv.amountDue, equals('3000.0'));
    });

    test('outletId missing defaults to empty string', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('outletId');
      final inv = InvoiceDto.fromJson(json);
      expect(inv.outletId, equals(''));
    });

    test('outletId null defaults to empty string', () {
      final json = {...fullJson, 'outletId': null};
      final inv = InvoiceDto.fromJson(json);
      expect(inv.outletId, equals(''));
    });

    test('nullable fields absent result in null', () {
      final json = {
        'id': 'inv-002',
        'invoiceNumber': 'INV-2024-002',
        'orderId': 'order-002',
        'total': '0',
        'amountPaid': '0',
        'amountDue': '0',
      };
      final inv = InvoiceDto.fromJson(json);
      expect(inv.invoiceDate, isNull);
      expect(inv.dueDate, isNull);
      expect(inv.createdAt, isNull);
    });

    test('monetary JSON null becomes string "null" via toString', () {
      // Per spec: if total is JSON null, toString() yields "null"
      final json = {...fullJson, 'total': null};
      final inv = InvoiceDto.fromJson(json);
      expect(inv.total, equals('null'));
    });
  });

  group('InvoiceLine.fromJson', () {
    final lineJson = {
      'id': 'line-001',
      'sku': 'SKU-XYZ',
      'qty': 3,
      'unitPrice': '1500.00',
      'lineTotal': '4500.00',
    };

    test('parses all fields correctly', () {
      final line = InvoiceLine.fromJson(lineJson);
      expect(line.id, equals('line-001'));
      expect(line.sku, equals('SKU-XYZ'));
      expect(line.qty, equals(3));
      expect(line.unitPrice, equals('1500.00'));
      expect(line.lineTotal, equals('4500.00'));
    });

    test('qty is coerced from num via toInt', () {
      final json = {...lineJson, 'qty': 3.0}; // double from JSON
      final line = InvoiceLine.fromJson(json);
      expect(line.qty, equals(3));
      expect(line.qty, isA<int>());
    });

    test('qty absent throws (no default)', () {
      final json = Map<String, dynamic>.from(lineJson)..remove('qty');
      expect(() => InvoiceLine.fromJson(json), throwsA(anything));
    });

    test('unitPrice accepts numeric JSON', () {
      final json = {...lineJson, 'unitPrice': 1500};
      final line = InvoiceLine.fromJson(json);
      expect(line.unitPrice, equals('1500'));
    });
  });

  group('InvoiceDetailDto.fromJson', () {
    final baseJson = {
      'id': 'inv-001',
      'invoiceNumber': 'INV-2024-001',
      'orderId': 'order-001',
      'outletId': 'outlet-001',
      'total': '5000.00',
      'amountPaid': '2000.00',
      'amountDue': '3000.00',
      'orderNumber': 'ORD-001',
      'subtotal': '4237.29',
      'discountAmount': '200.00',
      'charges': [
        {
          'id': 'charge-001',
          'name': 'GST 18%',
          'type': 'tax',
          'rate': '18',
          'amount': '762.71',
          'displayOrder': 1,
        }
      ],
      'lines': [
        {
          'id': 'line-001',
          'sku': 'SKU-001',
          'qty': 2,
          'unitPrice': '2000.00',
          'lineTotal': '4000.00',
        }
      ],
    };

    test('parses charges list correctly', () {
      final detail = InvoiceDetailDto.fromJson(baseJson);
      expect(detail.charges, hasLength(1));
      expect(detail.charges.first.name, equals('GST 18%'));
    });

    test('charges absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(baseJson)..remove('charges');
      final detail = InvoiceDetailDto.fromJson(json);
      expect(detail.charges, isEmpty);
    });

    test('lines absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(baseJson)..remove('lines');
      final detail = InvoiceDetailDto.fromJson(json);
      expect(detail.lines, isEmpty);
    });

    test('discountAmount nullable when absent', () {
      final json = Map<String, dynamic>.from(baseJson)..remove('discountAmount');
      final detail = InvoiceDetailDto.fromJson(json);
      expect(detail.discountAmount, isNull);
    });

    test('discountAmount nullable when JSON null', () {
      final json = {...baseJson, 'discountAmount': null};
      final detail = InvoiceDetailDto.fromJson(json);
      expect(detail.discountAmount, isNull);
    });

    test('subtotal nullable when absent', () {
      final json = Map<String, dynamic>.from(baseJson)..remove('subtotal');
      final detail = InvoiceDetailDto.fromJson(json);
      expect(detail.subtotal, isNull);
    });

    test('orderNumber missing defaults to empty string', () {
      final json = Map<String, dynamic>.from(baseJson)..remove('orderNumber');
      final detail = InvoiceDetailDto.fromJson(json);
      expect(detail.orderNumber, equals(''));
    });

    test('inherits all InvoiceDto fields', () {
      final detail = InvoiceDetailDto.fromJson(baseJson);
      expect(detail.id, equals('inv-001'));
      expect(detail.total, equals('5000.00'));
    });
  });

  group('PagedInvoices.fromJson', () {
    test('parses items and nextCursor', () {
      final json = {
        'items': [
          {
            'id': 'inv-001',
            'invoiceNumber': 'INV-001',
            'orderId': 'order-001',
            'total': '1000',
            'amountPaid': '0',
            'amountDue': '1000',
          }
        ],
        'nextCursor': 'cursor-xyz',
      };
      final paged = PagedInvoices.fromJson(json);
      expect(paged.items, hasLength(1));
      expect(paged.nextCursor, equals('cursor-xyz'));
    });

    test('items absent throws (no null guard)', () {
      final json = {'nextCursor': null};
      expect(() => PagedInvoices.fromJson(json), throwsA(anything));
    });

    test('nextCursor null when absent', () {
      final json = {
        'items': [],
      };
      final paged = PagedInvoices.fromJson(json);
      expect(paged.nextCursor, isNull);
    });
  });

  group('parseAmount edge case — "null" string', () {
    test('parseAmount("null") returns 0.0', () {
      // Critical edge case from spec: toString() on JSON null gives "null"
      // which double.tryParse fails to parse → 0.0
      expect(parseAmount('null'), equals(0.0));
    });
  });
}
