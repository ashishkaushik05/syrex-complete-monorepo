import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/dispatch.dart';

void main() {
  group('DispatchDto.fromJson', () {
    final fullJson = {
      'id': 'dispatch-uuid-001',
      'dispatchDate': '2026-06-01',
      'deliveryStatus': 'in_transit',
      'transporterName': 'Blue Dart',
      'vehicleNumber': 'KA-01-AB-1234',
      'lrNumber': 'LR-987654',
      'estimatedDelivery': '2026-06-05',
      'deliveredAt': null,
    };

    test('parses all 8 fields correctly', () {
      final dispatch = DispatchDto.fromJson(fullJson);
      expect(dispatch.id, equals('dispatch-uuid-001'));
      expect(dispatch.dispatchDate, equals('2026-06-01'));
      expect(dispatch.deliveryStatus, equals('in_transit'));
      expect(dispatch.transporterName, equals('Blue Dart'));
      expect(dispatch.vehicleNumber, equals('KA-01-AB-1234'));
      expect(dispatch.lrNumber, equals('LR-987654'));
      expect(dispatch.estimatedDelivery, equals('2026-06-05'));
      expect(dispatch.deliveredAt, isNull);
    });

    test('optional dispatchDate absent results in null', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('dispatchDate');
      final dispatch = DispatchDto.fromJson(json);
      expect(dispatch.dispatchDate, isNull);
    });

    test('optional lrNumber absent results in null', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('lrNumber');
      final dispatch = DispatchDto.fromJson(json);
      expect(dispatch.lrNumber, isNull);
    });

    test('optional estimatedDelivery absent results in null', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('estimatedDelivery');
      final dispatch = DispatchDto.fromJson(json);
      expect(dispatch.estimatedDelivery, isNull);
    });

    test('optional deliveredAt absent results in null', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('deliveredAt');
      final dispatch = DispatchDto.fromJson(json);
      expect(dispatch.deliveredAt, isNull);
    });

    test('missing required field id throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('id');
      expect(() => DispatchDto.fromJson(json), throwsA(anything));
    });

    test('missing required deliveryStatus throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('deliveryStatus');
      expect(() => DispatchDto.fromJson(json), throwsA(anything));
    });

    test('missing required transporterName throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('transporterName');
      expect(() => DispatchDto.fromJson(json), throwsA(anything));
    });

    test('missing required vehicleNumber throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('vehicleNumber');
      expect(() => DispatchDto.fromJson(json), throwsA(anything));
    });
  });

  group('DispatchLineDto.fromJson', () {
    final lineJson = {
      'id': 'line-uuid-001',
      'sku': 'SKU-BATT-001',
      'qtyOrdered': 10,
      'qtyDispatched': 10,
      'serialNumbers': ['SN001', 'SN002', 'SN003'],
    };

    test('parses all fields correctly', () {
      final line = DispatchLineDto.fromJson(lineJson);
      expect(line.id, equals('line-uuid-001'));
      expect(line.sku, equals('SKU-BATT-001'));
      expect(line.qtyOrdered, equals(10));
      expect(line.qtyDispatched, equals(10));
      expect(line.serialNumbers, equals(['SN001', 'SN002', 'SN003']));
    });

    test('qtyOrdered coerced from num (double) via toInt', () {
      final json = {...lineJson, 'qtyOrdered': 10.0};
      final line = DispatchLineDto.fromJson(json);
      expect(line.qtyOrdered, equals(10));
      expect(line.qtyOrdered, isA<int>());
    });

    test('qtyDispatched coerced from num (double) via toInt', () {
      final json = {...lineJson, 'qtyDispatched': 8.0};
      final line = DispatchLineDto.fromJson(json);
      expect(line.qtyDispatched, equals(8));
      expect(line.qtyDispatched, isA<int>());
    });

    test('serialNumbers absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(lineJson)..remove('serialNumbers');
      final line = DispatchLineDto.fromJson(json);
      expect(line.serialNumbers, isEmpty);
    });

    test('serialNumbers null defaults to empty list', () {
      final json = {...lineJson, 'serialNumbers': null};
      final line = DispatchLineDto.fromJson(json);
      expect(line.serialNumbers, isEmpty);
    });

    test('serialNumbers with single entry has no trailing comma', () {
      final json = {...lineJson, 'serialNumbers': ['SN001']};
      final line = DispatchLineDto.fromJson(json);
      expect(line.serialNumbers, equals(['SN001']));
      expect(line.serialNumbers.length, equals(1));
    });
  });

  group('DispatchDetailDto.fromJson', () {
    final detailJson = {
      'id': 'dispatch-uuid-001',
      'deliveryStatus': 'delivered',
      'transporterName': 'DTDC',
      'vehicleNumber': 'MH-02-CD-5678',
      'deliveredAt': '2026-06-04T14:30:00Z',
      'lines': [
        {
          'id': 'line-001',
          'sku': 'SKU-001',
          'qtyOrdered': 5,
          'qtyDispatched': 5,
          'serialNumbers': ['SN001', 'SN002'],
        }
      ],
    };

    test('parses lines list correctly', () {
      final detail = DispatchDetailDto.fromJson(detailJson);
      expect(detail.lines, hasLength(1));
      expect(detail.lines.first.sku, equals('SKU-001'));
    });

    test('lines absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(detailJson)..remove('lines');
      final detail = DispatchDetailDto.fromJson(json);
      expect(detail.lines, isEmpty);
    });

    test('lines null defaults to empty list', () {
      final json = {...detailJson, 'lines': null};
      final detail = DispatchDetailDto.fromJson(json);
      expect(detail.lines, isEmpty);
    });

    test('inherits all DispatchDto fields', () {
      final detail = DispatchDetailDto.fromJson(detailJson);
      expect(detail.id, equals('dispatch-uuid-001'));
      expect(detail.deliveryStatus, equals('delivered'));
      expect(detail.transporterName, equals('DTDC'));
    });
  });

  group('PagedDispatches.fromJson', () {
    test('parses items and nextCursor', () {
      final json = {
        'items': [
          {
            'id': 'dispatch-001',
            'deliveryStatus': 'in_transit',
            'transporterName': 'FedEx',
            'vehicleNumber': 'DL-01-AA-0001',
          }
        ],
        'nextCursor': 'cursor-abc',
      };
      final paged = PagedDispatches.fromJson(json);
      expect(paged.items, hasLength(1));
      expect(paged.items.first.id, equals('dispatch-001'));
      expect(paged.nextCursor, equals('cursor-abc'));
    });

    test('nextCursor nullable when absent', () {
      final json = {
        'items': [],
      };
      final paged = PagedDispatches.fromJson(json);
      expect(paged.nextCursor, isNull);
    });

    test('empty items is valid', () {
      final json = {'items': [], 'nextCursor': null};
      final paged = PagedDispatches.fromJson(json);
      expect(paged.items, isEmpty);
    });

    test('items absent throws', () {
      final json = {'nextCursor': null};
      expect(() => PagedDispatches.fromJson(json), throwsA(anything));
    });
  });
}
