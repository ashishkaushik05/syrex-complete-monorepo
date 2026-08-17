import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/catalog.dart';

void main() {
  group('ProductDto.fromJson', () {
    final fullJson = {
      'id': 'prod-uuid-001',
      'categoryId': 'cat-uuid-001',
      'name': 'Battery Pro 150Ah',
      'displayName': 'Pro 150Ah',
      'sku': 'BAT-PRO-150',
      'description': 'High performance battery',
      'basePrice': '12500.00',
      'warrantyMonths': 24,
      'isActive': true,
      'primaryImageUrl': 'https://example.com/image.jpg',
    };

    test('parses all fields correctly', () {
      final product = ProductDto.fromJson(fullJson);
      expect(product.id, equals('prod-uuid-001'));
      expect(product.categoryId, equals('cat-uuid-001'));
      expect(product.name, equals('Battery Pro 150Ah'));
      expect(product.displayName, equals('Pro 150Ah'));
      expect(product.sku, equals('BAT-PRO-150'));
      expect(product.description, equals('High performance battery'));
      expect(product.basePrice, equals('12500.00'));
      expect(product.warrantyMonths, equals(24));
      expect(product.isActive, isTrue);
      expect(product.primaryImageUrl, equals('https://example.com/image.jpg'));
    });

    test('basePrice stored as String coerced from numeric JSON via toString', () {
      final json = {...fullJson, 'basePrice': 12500.00};
      final product = ProductDto.fromJson(json);
      expect(product.basePrice, isA<String>());
      // toString() of 12500.0 in Dart is '12500.0'
      expect(product.basePrice, equals('12500.0'));
    });

    test('basePrice accepts integer JSON (coerced to string)', () {
      final json = {...fullJson, 'basePrice': 12500};
      final product = ProductDto.fromJson(json);
      expect(product.basePrice, isA<String>());
    });

    test('isActive absent defaults to true', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('isActive');
      final product = ProductDto.fromJson(json);
      expect(product.isActive, isTrue);
    });

    test('isActive null defaults to true', () {
      final json = {...fullJson, 'isActive': null};
      final product = ProductDto.fromJson(json);
      expect(product.isActive, isTrue);
    });

    test('isActive false is stored correctly when explicitly set', () {
      final json = {...fullJson, 'isActive': false};
      final product = ProductDto.fromJson(json);
      expect(product.isActive, isFalse);
    });

    test('warrantyMonths accepts float via toInt (truncated)', () {
      final json = {...fullJson, 'warrantyMonths': 12.0};
      final product = ProductDto.fromJson(json);
      expect(product.warrantyMonths, equals(12));
      expect(product.warrantyMonths, isA<int>());
    });

    test('primaryImageUrl nullable when absent', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('primaryImageUrl');
      final product = ProductDto.fromJson(json);
      expect(product.primaryImageUrl, isNull);
    });

    test('primaryImageUrl nullable when JSON null', () {
      final json = {...fullJson, 'primaryImageUrl': null};
      final product = ProductDto.fromJson(json);
      expect(product.primaryImageUrl, isNull);
    });

    test('displayName nullable when absent', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('displayName');
      final product = ProductDto.fromJson(json);
      expect(product.displayName, isNull);
    });

    test('description nullable when absent', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('description');
      final product = ProductDto.fromJson(json);
      expect(product.description, isNull);
    });

    group('displayTitle computed property', () {
      test('returns displayName when non-null', () {
        final product = ProductDto.fromJson(fullJson);
        expect(product.displayTitle, equals('Pro 150Ah'));
      });

      test('falls back to name when displayName is null', () {
        final json = {...fullJson, 'displayName': null};
        final product = ProductDto.fromJson(json);
        expect(product.displayTitle, equals('Battery Pro 150Ah'));
      });

      test('falls back to name when displayName is absent', () {
        final json = Map<String, dynamic>.from(fullJson)..remove('displayName');
        final product = ProductDto.fromJson(json);
        expect(product.displayTitle, equals('Battery Pro 150Ah'));
      });
    });
  });

  group('BrandDto.fromJson', () {
    test('parses id and name correctly', () {
      final json = {
        'id': 'brand-uuid-001',
        'name': 'Syrex Power',
        'description': 'Leading battery brand',
      };
      final brand = BrandDto.fromJson(json);
      expect(brand.id, equals('brand-uuid-001'));
      expect(brand.name, equals('Syrex Power'));
      expect(brand.description, equals('Leading battery brand'));
    });

    test('description nullable when absent', () {
      final json = {
        'id': 'brand-uuid-002',
        'name': 'BrandX',
      };
      final brand = BrandDto.fromJson(json);
      expect(brand.description, isNull);
    });

    test('description nullable when JSON null', () {
      final json = {
        'id': 'brand-uuid-003',
        'name': 'BrandY',
        'description': null,
      };
      final brand = BrandDto.fromJson(json);
      expect(brand.description, isNull);
    });

    test('missing id throws', () {
      final json = {'name': 'NoId Brand'};
      expect(() => BrandDto.fromJson(json), throwsA(anything));
    });

    test('missing name throws', () {
      final json = {'id': 'brand-001'};
      expect(() => BrandDto.fromJson(json), throwsA(anything));
    });
  });

  group('PagedProducts.fromJson', () {
    final productJson = {
      'id': 'prod-001',
      'categoryId': 'cat-001',
      'name': 'Test Battery',
      'sku': 'SKU-001',
      'basePrice': '5000',
      'warrantyMonths': 12,
    };

    test('parses items and nextCursor', () {
      final json = {
        'items': [productJson],
        'nextCursor': 'cursor-abc',
      };
      final paged = PagedProducts.fromJson(json);
      expect(paged.items, hasLength(1));
      expect(paged.items.first.id, equals('prod-001'));
      expect(paged.nextCursor, equals('cursor-abc'));
    });

    test('nextCursor null when absent', () {
      final json = {'items': [productJson]};
      final paged = PagedProducts.fromJson(json);
      expect(paged.nextCursor, isNull);
    });

    test('empty items list is valid', () {
      final json = {'items': [], 'nextCursor': null};
      final paged = PagedProducts.fromJson(json);
      expect(paged.items, isEmpty);
    });

    test('nextCursor nullable when JSON null', () {
      final json = {'items': [], 'nextCursor': null};
      final paged = PagedProducts.fromJson(json);
      expect(paged.nextCursor, isNull);
    });
  });
}
