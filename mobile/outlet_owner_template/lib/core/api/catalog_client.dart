import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import 'outlet_portal_client.dart' show PagedResult;

class Brand {
  const Brand({required this.id, required this.name});

  final String id;
  final String name;

  factory Brand.fromJson(Map<String, dynamic> j) =>
      Brand(id: j['id'] as String, name: j['name'] as String);
}

class Category {
  const Category({required this.id, required this.name, this.parentId});

  final String id;
  final String name;
  final String? parentId;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String,
        name: j['name'] as String,
        parentId: j['parentId'] as String?,
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
  });

  final String id;
  final String sku;
  final String name;
  final String categoryId;
  final String? brandId;
  final String? description;
  final String? basePrice;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        sku: j['sku'] as String,
        name: j['name'] as String,
        categoryId: j['categoryId'] as String,
        brandId: j['brandId'] as String?,
        description: j['description'] as String?,
        basePrice: j['basePrice'] as String?,
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
    final res = await _dio.get(
      '/trpc/brands.list',
      queryParameters: {'input': '{"json":{"limit":100}}'},
    );
    final data = _extract(res.data);
    return (data['items'] as List<dynamic>)
        .map((e) => Brand.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Category>> categories() async {
    final res = await _dio.get(
      '/trpc/categories.list',
      queryParameters: {'input': '{"json":{"limit":100}}'},
    );
    final data = _extract(res.data);
    return (data['items'] as List<dynamic>)
        .map((e) => Category.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PagedResult<Product>> products({
    String? brandId,
    String? categoryId,
    String? q,
    String? cursor,
    int limit = 30,
  }) async {
    final params = <String, dynamic>{'limit': limit};
    if (brandId != null) params['brandId'] = brandId;
    if (categoryId != null) params['categoryId'] = categoryId;
    if (q != null) params['q'] = q;
    if (cursor != null) params['cursor'] = cursor;

    final res = await _dio.get(
      '/trpc/products.list',
      queryParameters: {'input': '{"json":${jsonEncode(params)}}'},
    );
    final data = _extract(res.data);
    return PagedResult(
      items: (data['items'] as List<dynamic>)
          .map((e) => Product.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: data['nextCursor'] as String?,
    );
  }

  Future<Product> getProduct(String id) async {
    final res = await _dio.get(
      '/trpc/products.getById',
      queryParameters: {'input': '{"json":{"id":"$id"}}'},
    );
    final data = _extract(res.data);
    return Product.fromJson(data as Map<String, dynamic>);
  }
}

final catalogClientProvider = Provider<CatalogClient>((ref) {
  return CatalogClient(ref.watch(dioProvider));
});

final brandsProvider = FutureProvider.autoDispose<List<Brand>>((ref) {
  return ref.watch(catalogClientProvider).brands();
});

final categoriesProvider = FutureProvider.autoDispose<List<Category>>((ref) {
  return ref.watch(catalogClientProvider).categories();
});

final productsProvider = FutureProvider.autoDispose.family<PagedResult<Product>, ({String? brandId, String? categoryId, String? q})>((ref, params) {
  return ref.watch(catalogClientProvider).products(
    brandId: params.brandId,
    categoryId: params.categoryId,
    q: params.q,
  );
});

final productDetailProvider = FutureProvider.autoDispose.family<Product, String>((ref, productId) async {
  return ref.watch(catalogClientProvider).getProduct(productId);
});
