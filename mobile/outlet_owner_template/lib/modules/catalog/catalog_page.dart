import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/catalog_client.dart';
import '../../core/api/outlet_portal_client.dart' show PagedResult;
import '../../modules/orders/cart_provider.dart';
import '../../shared/widgets/error_view.dart';

final _brandsProvider = FutureProvider.autoDispose<List<Brand>>((ref) {
  return ref.watch(catalogClientProvider).brands();
});

final _categoriesProvider = FutureProvider.autoDispose<List<Category>>((ref) {
  return ref.watch(catalogClientProvider).categories();
});

final _catalogFilterProvider = StateProvider.autoDispose<
    ({String? brandId, String? categoryId, String? q})>(
  (_) => (brandId: null, categoryId: null, q: null),
);

final _productsProvider = FutureProvider.autoDispose
    .family<PagedResult<Product>, ({String? brandId, String? categoryId, String? q})>(
        (ref, args) {
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
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
                onPressed: () => context.push('/orders/create'),
              ),
              if (cart.items.isNotEmpty)
                Positioned(
                  right: 6,
                  top: 6,
                  child: CircleAvatar(
                    radius: 8,
                    backgroundColor: Theme.of(context).colorScheme.error,
                    child: Text(
                      '${cart.items.length}',
                      style: const TextStyle(fontSize: 10, color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search products…',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8)),
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
              onChanged: (v) =>
                  ref.read(_catalogFilterProvider.notifier).state = (
                    brandId: filter.brandId,
                    categoryId: filter.categoryId,
                    q: v.isEmpty ? null : v,
                  ),
            ),
          ),
          const SizedBox(height: 8),
          // Brand filter
          brands.maybeWhen(
            data: (list) => SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  _Chip(
                    label: 'All Brands',
                    selected: filter.brandId == null,
                    onTap: () =>
                        ref.read(_catalogFilterProvider.notifier).state = (
                          brandId: null,
                          categoryId: filter.categoryId,
                          q: filter.q,
                        ),
                  ),
                  ...list.map((b) => _Chip(
                        label: b.name,
                        selected: filter.brandId == b.id,
                        onTap: () => ref
                            .read(_catalogFilterProvider.notifier)
                            .state = (
                          brandId: b.id,
                          categoryId: filter.categoryId,
                          q: filter.q,
                        ),
                      )),
                ],
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
          const SizedBox(height: 4),
          // Category filter
          categories.maybeWhen(
            data: (list) => SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  _Chip(
                    label: 'All Categories',
                    selected: filter.categoryId == null,
                    onTap: () =>
                        ref.read(_catalogFilterProvider.notifier).state = (
                          brandId: filter.brandId,
                          categoryId: null,
                          q: filter.q,
                        ),
                  ),
                  ...list.map((c) => _Chip(
                        label: c.name,
                        selected: filter.categoryId == c.id,
                        onTap: () => ref
                            .read(_catalogFilterProvider.notifier)
                            .state = (
                          brandId: filter.brandId,
                          categoryId: c.id,
                          q: filter.q,
                        ),
                      )),
                ],
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: products.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorView(
                message: 'Could not load products.',
                onRetry: () => ref.refresh(_productsProvider(filter).future),
              ),
              data: (result) {
                final items = result.items;
                if (items.isEmpty) {
                  return const Center(child: Text('No products found.'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 80),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _ProductCard(product: items[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(
      {required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label, style: const TextStyle(fontSize: 12)),
        selected: selected,
        onSelected: (_) => onTap(),
        visualDensity: VisualDensity.compact,
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

    return Card(
      child: ListTile(
        title: Text(product.name,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(product.basePrice != null
            ? '${product.sku}  •  ₹${product.basePrice}'
            : product.sku),
        trailing: inCart
            ? FilledButton.icon(
                onPressed: () => context.push('/orders/create'),
                icon: const Icon(Icons.shopping_cart, size: 16),
                label: const Text('In Cart'),
              )
            : OutlinedButton.icon(
                onPressed: () {
                  ref
                      .read(cartProvider.notifier)
                      .addProduct(product, product.basePrice ?? '0.00');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('${product.name} added to cart'),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                },
                icon: const Icon(Icons.add_shopping_cart, size: 16),
                label: const Text('Add'),
              ),
      ),
    );
  }
}
