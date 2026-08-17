class BrandDto {
  final String id;
  final String name;
  final String? description;

  const BrandDto({required this.id, required this.name, this.description});

  factory BrandDto.fromJson(Map<String, dynamic> j) => BrandDto(
    id: j['id'] as String,
    name: j['name'] as String,
    description: j['description'] as String?,
  );
}

class CategoryDto {
  final String id;
  final String brandId;
  final String name;

  const CategoryDto({required this.id, required this.brandId, required this.name});

  factory CategoryDto.fromJson(Map<String, dynamic> j) => CategoryDto(
    id: j['id'] as String,
    brandId: j['brandId'] as String,
    name: j['name'] as String,
  );
}

class ProductDto {
  final String id;
  final String categoryId;
  final String name;
  final String? displayName;
  final String sku;
  final String? description;
  final String basePrice;
  final String gstRate;
  final int warrantyMonths;
  final bool isActive;
  final String? primaryImageUrl;

  const ProductDto({
    required this.id,
    required this.categoryId,
    required this.name,
    this.displayName,
    required this.sku,
    this.description,
    required this.basePrice,
    required this.gstRate,
    required this.warrantyMonths,
    required this.isActive,
    this.primaryImageUrl,
  });

  factory ProductDto.fromJson(Map<String, dynamic> j) => ProductDto(
    id: j['id'] as String,
    categoryId: j['categoryId'] as String,
    name: j['name'] as String,
    displayName: j['displayName'] as String?,
    sku: j['sku'] as String,
    description: j['description'] as String?,
    basePrice: j['basePrice'].toString(),
    gstRate: j['gstRate']?.toString() ?? '0',
    warrantyMonths: (j['warrantyMonths'] as num).toInt(),
    isActive: j['isActive'] as bool? ?? true,
    primaryImageUrl: j['primaryImageUrl'] as String?,
  );

  String get displayTitle => displayName ?? name;
}

class PagedProducts {
  final List<ProductDto> items;
  final String? nextCursor;

  const PagedProducts({required this.items, this.nextCursor});

  factory PagedProducts.fromJson(Map<String, dynamic> j) => PagedProducts(
    items: (j['items'] as List<dynamic>).map((e) => ProductDto.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: j['nextCursor'] as String?,
  );
}
