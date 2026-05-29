import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../../shared/widgets/rb_components.dart';
import 'sales_client.dart' show PagedResult;

class Brand {
  const Brand({
    required this.id,
    required this.name,
    this.tagline,
    this.productCount,
    this.colorHex,
  });

  final String id;
  final String name;
  final String? tagline;
  final int? productCount;
  final String? colorHex;

  Color get color {
    if (colorHex != null && colorHex!.isNotEmpty) {
      try {
        final hex = colorHex!.replaceFirst('#', '');
        return Color(int.parse('FF$hex', radix: 16));
      } catch (_) {}
    }
    return brandColorForId(id);
  }

  factory Brand.fromJson(Map<String, dynamic> j) => Brand(
        id: j['id'] as String,
        name: j['name'] as String,
        tagline: j['tagline'] as String?,
        productCount: (j['productCount'] as num?)?.toInt(),
        colorHex: j['colorHex'] as String?,
      );
}

class ProductSpec {
  const ProductSpec({required this.k, required this.v});

  final String k;
  final String v;

  factory ProductSpec.fromJson(Map<String, dynamic> j) =>
      ProductSpec(k: j['k'] as String, v: j['v'] as String);
}

List<ProductSpec> _parseSpecs(dynamic raw) {
  if (raw is List) {
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ProductSpec.fromJson)
        .toList();
  }
  if (raw is Map<String, dynamic>) {
    return raw.entries
        .map((entry) => ProductSpec(k: entry.key, v: entry.value.toString()))
        .toList();
  }
  return const [];
}

class Category {
  const Category({required this.id, required this.name, this.parentId, this.brandId, this.productCount});

  final String id;
  final String name;
  final String? parentId;
  final String? brandId;
  final int? productCount;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String,
        name: j['name'] as String,
        parentId: j['parentId'] as String?,
        brandId: j['brandId'] as String?,
        productCount: (j['productCount'] as num?)?.toInt(),
      );
}

class Product {
  const Product({
    required this.id,
    required this.sku,
    required this.name,
    required this.categoryId,
    this.brandId,
    this.description,
    this.basePrice,
    this.mrp,
    this.stock,
    this.warrantyMonths,
    this.specs = const [],
  });

  final String id;
  final String sku;
  final String name;
  final String categoryId;
  final String? brandId;
  final String? description;
  final String? basePrice;
  final String? mrp;
  final int? stock;
  final int? warrantyMonths;
  final List<ProductSpec> specs;

  double get basePriceNum => double.tryParse(basePrice ?? '0') ?? 0;
  double get mrpNum => double.tryParse(mrp ?? '0') ?? 0;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        sku: j['sku'] as String,
        name: j['name'] as String,
        categoryId: j['categoryId'] as String? ?? '',
        brandId: j['brandId'] as String?,
        description: j['description'] as String?,
        basePrice: j['basePrice']?.toString(),
        mrp: j['mrp']?.toString(),
        stock: (j['stock'] as num?)?.toInt(),
        warrantyMonths: (j['warrantyMonths'] as num?)?.toInt(),
        specs: _parseSpecs(j['specs']),
      );
}

class CatalogClient {
  CatalogClient(this._dio);

  final Dio _dio;

  Map<String, dynamic> _extract(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) {
        return (first['result']?['data']?['json'] ?? <String, dynamic>{})
            as Map<String, dynamic>;
      }
    }
    if (raw is Map<String, dynamic>) {
      return (raw['result']?['data']?['json'] ?? <String, dynamic>{})
          as Map<String, dynamic>;
    }
    return <String, dynamic>{};
  }

  Future<List<Brand>> brands() async {
    final brands = <Brand>[];
    String? cursor;
    do {
      final res = await _dio.get(
        '/brands.list',
        queryParameters: {
          'input': jsonEncode({
            'json': {
              'limit': 100,
              'isActive': true,
              if (cursor != null) 'cursor': cursor,
            }
          })
        },
      );
      final data = _extract(res.data);
      brands.addAll((data['items'] as List<dynamic>? ?? [])
          .map((e) => Brand.fromJson(e as Map<String, dynamic>)));
      cursor = data['nextCursor'] as String?;
    } while (cursor != null);
    return brands;
  }

  Future<List<Category>> categories({String? brandId}) async {
    final categories = <Category>[];
    String? cursor;
    do {
      final params = <String, dynamic>{'limit': 100, 'isActive': true};
      if (brandId != null) params['brandId'] = brandId;
      if (cursor != null) params['cursor'] = cursor;
      final res = await _dio.get(
        '/categories.list',
        queryParameters: {'input': jsonEncode({'json': params})},
      );
      final data = _extract(res.data);
      categories.addAll((data['items'] as List<dynamic>? ?? [])
          .map((e) => Category.fromJson(e as Map<String, dynamic>)));
      cursor = data['nextCursor'] as String?;
    } while (cursor != null);
    return categories;
  }

  Future<PagedResult<Product>> products({
    String? brandId,
    String? categoryId,
    String? q,
    String? cursor,
    int limit = 30,
  }) async {
    final products = <Product>[];
    String? next = cursor;
    do {
      final params = <String, dynamic>{
        'limit': limit.clamp(1, 100),
        'isActive': true,
      };
      if (brandId != null) params['brandId'] = brandId;
      if (categoryId != null) params['categoryId'] = categoryId;
      if (q != null && q.isNotEmpty) params['q'] = q;
      if (next != null) params['cursor'] = next;

      final res = await _dio.get(
        '/products.list',
        queryParameters: {'input': jsonEncode({'json': params})},
      );
      final data = _extract(res.data);
      products.addAll((data['items'] as List<dynamic>? ?? [])
          .map((e) => Product.fromJson(e as Map<String, dynamic>)));
      next = data['nextCursor'] as String?;
    } while (next != null);

    return PagedResult(
      items: products,
      nextCursor: null,
    );
  }

  Future<Product> productById(String id) async {
    final res = await _dio.get(
      '/products.getById',
      queryParameters: {'input': jsonEncode({'json': {'id': id}})},
    );
    return Product.fromJson(_extract(res.data));
  }
}

final catalogClientProvider = Provider<CatalogClient>((ref) {
  return CatalogClient(ref.watch(dioProvider));
});
