import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/catalog_client.dart';
import '../../core/api/sales_client.dart' show PagedResult;
import '../../modules/orders/cart_provider.dart';
import '../../shared/widgets/premium_surfaces.dart';

final _brandsProvider = FutureProvider.autoDispose<List<Brand>>((ref) {
  return ref.watch(catalogClientProvider).brands();
});

final _categoriesProvider = FutureProvider.autoDispose<List<Category>>((ref) {
  return ref.watch(catalogClientProvider).categories();
});

final _catalogFilterProvider = StateProvider.autoDispose<({String? brandId, String? categoryId, String? q})>(
  (_) => (brandId: null, categoryId: null, q: null),
);

final _productsProvider = FutureProvider.autoDispose
    .family<PagedResult<Product>, ({String? brandId, String? categoryId, String? q})>((ref, args) {
  return ref.watch(catalogClientProvider).products(
        brandId: args.brandId,
        categoryId: args.categoryId,
        q: args.q,
      );
});

class CatalogPage extends ConsumerStatefulWidget {
  const CatalogPage({super.key});

  @override
  ConsumerState<CatalogPage> createState() => _CatalogPageState();
}

class _CatalogPageState extends ConsumerState<CatalogPage> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(_catalogFilterProvider);
    final brands = ref.watch(_brandsProvider);
    final categories = ref.watch(_categoriesProvider);
    final products = ref.watch(_productsProvider(filter));
    final cart = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Catalog'),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_cart_outlined),
            onPressed: () => context.push('/orders/create'),
          ),
        ],
      ),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
          children: [
            TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search products',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          ref.read(_catalogFilterProvider.notifier).state =
                              (brandId: filter.brandId, categoryId: filter.categoryId, q: null);
                        },
                      )
                    : null,
              ),
              onChanged: (v) {
                ref.read(_catalogFilterProvider.notifier).state = (
                  brandId: filter.brandId,
                  categoryId: filter.categoryId,
                  q: v.isEmpty ? null : v,
                );
              },
            ),
            const SizedBox(height: 10),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Filters', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  brands.maybeWhen(
                    data: (list) => SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          _Chip(
                            label: 'All Brands',
                            selected: filter.brandId == null,
                            onTap: () => ref.read(_catalogFilterProvider.notifier).state = (
                              brandId: null,
                              categoryId: filter.categoryId,
                              q: filter.q,
                            ),
                          ),
                          ...list.map(
                            (b) => _Chip(
                              label: b.name,
                              selected: filter.brandId == b.id,
                              onTap: () => ref.read(_catalogFilterProvider.notifier).state = (
                                brandId: b.id,
                                categoryId: filter.categoryId,
                                q: filter.q,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    orElse: () => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 6),
                  categories.maybeWhen(
                    data: (list) => SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          _Chip(
                            label: 'All Categories',
                            selected: filter.categoryId == null,
                            onTap: () => ref.read(_catalogFilterProvider.notifier).state = (
                              brandId: filter.brandId,
                              categoryId: null,
                              q: filter.q,
                            ),
                          ),
                          ...list.map(
                            (c) => _Chip(
                              label: c.name,
                              selected: filter.categoryId == c.id,
                              onTap: () => ref.read(_catalogFilterProvider.notifier).state = (
                                brandId: filter.brandId,
                                categoryId: c.id,
                                q: filter.q,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    orElse: () => const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            products.when(
              loading: () => const PremiumCard(child: LinearProgressIndicator()),
              error: (_, __) => const PremiumCard(
                child: EmptyStateView(
                  title: 'Catalog unavailable',
                  subtitle: 'Retry once connectivity is stable.',
                  icon: Icons.menu_book_outlined,
                ),
              ),
              data: (result) {
                final items = result.items;
                if (items.isEmpty) {
                  return const PremiumCard(
                    child: EmptyStateView(
                      title: 'No products match',
                      subtitle: 'Adjust filters or search terms.',
                      icon: Icons.search_off,
                    ),
                  );
                }
                return Column(
                  children: items
                      .map(
                        (product) => _ProductCard(product: product),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
      floatingActionButton: cart.items.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push('/orders/create'),
              icon: const Icon(Icons.shopping_cart_checkout),
              label: Text('Cart (${cart.items.length})'),
            ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
      ),
    );
  }
}

class _ProductCard extends ConsumerWidget {
  const _ProductCard({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final inCart = cart.items.any((i) => i.product.id == product.id);

    return PremiumCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(product.name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(product.basePrice != null ? '${product.sku} • ₹${product.basePrice}' : product.sku),
        trailing: inCart
            ? FilledButton(
                onPressed: () => context.push('/orders/create'),
                child: const Text('In Cart'),
              )
            : OutlinedButton(
                onPressed: () {
                  ref.read(cartProvider.notifier).addProduct(product, product.basePrice ?? '0.00');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('${product.name} added to cart')),
                  );
                },
                child: const Text('Add'),
              ),
      ),
    );
  }
}
