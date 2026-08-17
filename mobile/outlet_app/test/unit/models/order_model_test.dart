import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/order.dart';

void main() {
  group('OrderDto.fromJson', () {
    final fullJson = {
      'id': 'order-uuid-001',
      'orderNumber': 'ORD-0042',
      'outletId': 'outlet-uuid-001',
      'status': 'approved',
      'priority': 'high',
      'orderDate': '2026-06-01',
      'deliveryAddress': '123 Main St, Bangalore',
      'totalValue': '5000.00',
      'subtotalValue': '4237.29',
      'taxTotal': '762.71',
      'notes': 'Handle with care',
      'approvedAt': '2026-06-01T10:00:00Z',
      'rejectionReason': null,
      'lines': [
        {
          'id': 'line-001',
          'productId': 'prod-001',
          'sku': 'SKU-001',
          'qtyOrdered': 2,
          'qtyDispatched': 0,
          'unitPrice': '2000.00',
          'lineTotal': '4000.00',
          'status': 'pending',
        }
      ],
    };

    test('parses all fields correctly when all present', () {
      final order = OrderDto.fromJson(fullJson);
      expect(order.id, equals('order-uuid-001'));
      expect(order.orderNumber, equals('ORD-0042'));
      expect(order.outletId, equals('outlet-uuid-001'));
      expect(order.status, equals('approved'));
      expect(order.priority, equals('high'));
      expect(order.orderDate, equals('2026-06-01'));
      expect(order.deliveryAddress, equals('123 Main St, Bangalore'));
      expect(order.totalValue, equals('5000.00'));
      expect(order.subtotalValue, equals('4237.29'));
      expect(order.taxTotal, equals('762.71'));
      expect(order.notes, equals('Handle with care'));
      expect(order.approvedAt, equals('2026-06-01T10:00:00Z'));
      expect(order.rejectionReason, isNull);
      expect(order.lines, hasLength(1));
    });

    test('nullable fields absent result in null', () {
      final json = {
        'id': 'order-uuid-002',
        'orderNumber': 'ORD-0001',
        'outletId': 'outlet-uuid-001',
        'status': 'pending_approval',
        'totalValue': '0',
        'subtotalValue': '0',
        'taxTotal': '0',
      };
      final order = OrderDto.fromJson(json);
      expect(order.orderDate, isNull);
      expect(order.notes, isNull);
      expect(order.approvedAt, isNull);
      expect(order.rejectionReason, isNull);
    });

    test('status missing would throw (required field)', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('status');
      expect(() => OrderDto.fromJson(json), throwsA(anything));
    });

    test('priority missing defaults to "medium"', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('priority');
      final order = OrderDto.fromJson(json);
      expect(order.priority, equals('medium'));
    });

    test('deliveryAddress missing defaults to empty string', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('deliveryAddress');
      final order = OrderDto.fromJson(json);
      expect(order.deliveryAddress, equals(''));
    });

    test('notes absent results in null', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('notes');
      final order = OrderDto.fromJson(json);
      expect(order.notes, isNull);
    });

    test('lines absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('lines');
      final order = OrderDto.fromJson(json);
      expect(order.lines, isEmpty);
    });

    test('monetary fields accept numeric JSON values (toString coercion)', () {
      final json = {
        ...fullJson,
        'totalValue': 9999.99,
        'subtotalValue': 8474.57,
        'taxTotal': 1525.42,
      };
      final order = OrderDto.fromJson(json);
      expect(order.totalValue, equals('9999.99'));
      expect(order.subtotalValue, equals('8474.57'));
      expect(order.taxTotal, equals('1525.42'));
    });

    group('displayStatus computed property', () {
      test('pending_approval maps to "pending"', () {
        final order = OrderDto.fromJson({...fullJson, 'status': 'pending_approval'});
        expect(order.displayStatus, equals('pending'));
      });

      test('fully_dispatched maps to "dispatched"', () {
        final order = OrderDto.fromJson({...fullJson, 'status': 'fully_dispatched'});
        expect(order.displayStatus, equals('dispatched'));
      });

      test('partially_dispatched maps to "dispatched"', () {
        final order = OrderDto.fromJson({...fullJson, 'status': 'partially_dispatched'});
        expect(order.displayStatus, equals('dispatched'));
      });

      test('approved passes through unchanged', () {
        final order = OrderDto.fromJson({...fullJson, 'status': 'approved'});
        expect(order.displayStatus, equals('approved'));
      });

      test('cancelled passes through unchanged', () {
        final order = OrderDto.fromJson({...fullJson, 'status': 'cancelled'});
        expect(order.displayStatus, equals('cancelled'));
      });

      test('unknown status passes through unchanged', () {
        final order = OrderDto.fromJson({...fullJson, 'status': 'some_unknown_status'});
        expect(order.displayStatus, equals('some_unknown_status'));
      });
    });
  });

  group('OrderLineDto.fromJson', () {
    final lineJson = {
      'id': 'line-001',
      'productId': 'prod-001',
      'sku': 'SKU-ABC',
      'qtyOrdered': 3,
      'qtyDispatched': 1,
      'unitPrice': '1500.00',
      'lineTotal': '4500.00',
      'status': 'partial',
    };

    test('parses all fields correctly', () {
      final line = OrderLineDto.fromJson(lineJson);
      expect(line.id, equals('line-001'));
      expect(line.productId, equals('prod-001'));
      expect(line.sku, equals('SKU-ABC'));
      expect(line.qtyOrdered, equals(3));
      expect(line.qtyDispatched, equals(1));
      expect(line.unitPrice, equals('1500.00'));
      expect(line.lineTotal, equals('4500.00'));
      expect(line.status, equals('partial'));
    });

    test('qtyOrdered coerced from num via toInt', () {
      final json = {...lineJson, 'qtyOrdered': 2.0}; // double from JSON
      final line = OrderLineDto.fromJson(json);
      expect(line.qtyOrdered, equals(2));
      expect(line.qtyOrdered, isA<int>());
    });

    test('qtyDispatched coerced from num via toInt', () {
      final json = {...lineJson, 'qtyDispatched': 1.0};
      final line = OrderLineDto.fromJson(json);
      expect(line.qtyDispatched, equals(1));
      expect(line.qtyDispatched, isA<int>());
    });

    test('qtyDispatched absent defaults to 0', () {
      final json = Map<String, dynamic>.from(lineJson)..remove('qtyDispatched');
      final line = OrderLineDto.fromJson(json);
      expect(line.qtyDispatched, equals(0));
    });

    test('status absent defaults to "pending"', () {
      final json = Map<String, dynamic>.from(lineJson)..remove('status');
      final line = OrderLineDto.fromJson(json);
      expect(line.status, equals('pending'));
    });

    test('unitPrice and lineTotal accept numeric JSON (toString coercion)', () {
      final json = {...lineJson, 'unitPrice': 1500, 'lineTotal': 4500};
      final line = OrderLineDto.fromJson(json);
      expect(line.unitPrice, equals('1500'));
      expect(line.lineTotal, equals('4500'));
    });
  });

  group('PagedOrders.fromJson', () {
    test('parses items list correctly', () {
      final json = {
        'items': [
          {
            'id': 'order-001',
            'orderNumber': 'ORD-001',
            'outletId': 'outlet-001',
            'status': 'approved',
            'totalValue': '1000',
            'subtotalValue': '900',
            'taxTotal': '100',
          }
        ],
        'nextCursor': 'cursor-abc',
      };
      final paged = PagedOrders.fromJson(json);
      expect(paged.items, hasLength(1));
      expect(paged.items.first.id, equals('order-001'));
      expect(paged.nextCursor, equals('cursor-abc'));
    });

    test('nextCursor is null when absent', () {
      final json = {
        'items': [],
        // nextCursor key absent
      };
      final paged = PagedOrders.fromJson(json);
      expect(paged.nextCursor, isNull);
    });

    test('empty items list is valid', () {
      final json = {'items': [], 'nextCursor': null};
      final paged = PagedOrders.fromJson(json);
      expect(paged.items, isEmpty);
    });
  });

  group('CreateOrderInput.toJson', () {
    final lines = [
      CreateOrderLineInput(
        productId: 'prod-001',
        qtyOrdered: 2,
        unitPrice: '1500.00',
      ),
    ];

    test('notes omitted when null', () {
      final input = CreateOrderInput(
        outletId: 'outlet-001',
        deliveryAddress: '123 Main St',
        priority: 'medium',
        lines: lines,
        notes: null,
      );
      final json = input.toJson();
      expect(json.containsKey('notes'), isFalse);
    });

    test('notes included when present', () {
      final input = CreateOrderInput(
        outletId: 'outlet-001',
        deliveryAddress: '123 Main St',
        priority: 'medium',
        lines: lines,
        notes: 'Please deliver by evening',
      );
      final json = input.toJson();
      expect(json['notes'], equals('Please deliver by evening'));
    });

    test('lines always present in toJson', () {
      final input = CreateOrderInput(
        outletId: 'outlet-001',
        deliveryAddress: '123 Main St',
        priority: 'high',
        lines: lines,
      );
      final json = input.toJson();
      expect(json.containsKey('lines'), isTrue);
      expect(json['lines'], isA<List>());
      expect(json['lines'], hasLength(1));
    });

    test('lines is empty list when no lines provided', () {
      final input = CreateOrderInput(
        outletId: 'outlet-001',
        deliveryAddress: '123 Main St',
        priority: 'low',
        lines: [],
      );
      final json = input.toJson();
      expect(json['lines'], equals([]));
    });

    test('all required fields present in output', () {
      final input = CreateOrderInput(
        outletId: 'outlet-001',
        deliveryAddress: 'Test Address',
        priority: 'medium',
        lines: lines,
      );
      final json = input.toJson();
      expect(json['outletId'], equals('outlet-001'));
      expect(json['deliveryAddress'], equals('Test Address'));
      expect(json['priority'], equals('medium'));
    });
  });

  group('CreateOrderLineInput.toJson', () {
    test('serializes all fields correctly', () {
      final line = CreateOrderLineInput(
        productId: 'prod-abc',
        qtyOrdered: 5,
        unitPrice: '2000.00',
      );
      final json = line.toJson();
      expect(json['productId'], equals('prod-abc'));
      expect(json['qtyOrdered'], equals(5));
      expect(json['unitPrice'], equals('2000.00'));
    });
  });
}
