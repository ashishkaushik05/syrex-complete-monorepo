import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../models/catalog.dart';

class CatalogClient {
  final ApiClient _api;
  const CatalogClient(this._api);

  Future<List<BrandDto>> listBrands() =>
      _api.query('brands.list', {}, (j) {
        final map = j as Map<String, dynamic>;
        return (map['items'] as List<dynamic>)
            .map((e) => BrandDto.fromJson(e as Map<String, dynamic>))
            .toList();
      });

  Future<List<CategoryDto>> listCategories({String? brandId}) =>
      _api.query('categories.list', {
        if (brandId != null) 'brandId': brandId,
      }, (j) {
        final map = j as Map<String, dynamic>;
        return (map['items'] as List<dynamic>)
            .map((e) => CategoryDto.fromJson(e as Map<String, dynamic>))
            .toList();
      });

  Future<PagedProducts> listProducts({
    String? categoryId,
    String? brandId,
    String? q,
    String? cursor,
    int limit = 50,
  }) =>
      _api.query('products.list', {
        'limit': limit,
        if (categoryId != null) 'categoryId': categoryId,
        if (brandId != null) 'brandId': brandId,
        if (q != null) 'q': q,
        if (cursor != null) 'cursor': cursor,
      }, (j) => PagedProducts.fromJson(j as Map<String, dynamic>));
}

final catalogClientProvider = Provider<CatalogClient>(
  (ref) => CatalogClient(ref.read(apiClientProvider)),
);
