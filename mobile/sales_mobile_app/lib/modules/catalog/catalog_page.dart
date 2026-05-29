import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/catalog_client.dart';
import '../../core/api/sales_client.dart' show PagedResult;
import '../../modules/orders/cart_provider.dart';
import '../../shared/widgets/rb_components.dart';

// ─── Providers ─────────────────────────────────────────────────────────────────

final _brandsProvider = FutureProvider.autoDispose<List<Brand>>((ref) {
  return ref.watch(catalogClientProvider).brands();
});

final _categoriesProvider =
    FutureProvider.autoDispose.family<List<Category>, String?>((ref, brandId) {
  return ref.watch(catalogClientProvider).categories(brandId: brandId);
});

final _productsProvider = FutureProvider.autoDispose
    .family<PagedResult<Product>, ({String? brandId, String? categoryId, String? q})>(
        (ref, args) {
  return ref.watch(catalogClientProvider).products(
        brandId: args.brandId,
        categoryId: args.categoryId,
        q: args.q,
      );
});

enum _CatalogLevel { brands, categories, products }

class _CatalogState {
  const _CatalogState({
    this.level = _CatalogLevel.brands,
    this.brand,
    this.category,
    this.q,
  });
  final _CatalogLevel level;
  final Brand? brand;
  final Category? category;
  final String? q;

  _CatalogState copyWith({
    _CatalogLevel? level,
    Brand? brand,
    Category? category,
    String? q,
    bool clearQ = false,
  }) =>
      _CatalogState(
        level: level ?? this.level,
        brand: brand ?? this.brand,
        category: category ?? this.category,
        q: clearQ ? null : (q ?? this.q),
      );
}

final _catalogStateProvider =
    StateProvider.autoDispose<_CatalogState>((_) => const _CatalogState());

// ─── Page ──────────────────────────────────────────────────────────────────────

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

  void _setQ(String v) {
    ref.read(_catalogStateProvider.notifier).update(
          (s) => s.copyWith(q: v.isEmpty ? null : v, clearQ: v.isEmpty),
        );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(_catalogStateProvider);
    final cartCount = ref.watch(cartProvider).items.length;
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          _CatalogTopBar(
            level: state.level,
            brand: state.brand,
            category: state.category,
            cartCount: cartCount,
            onBack: () {
              _searchCtrl.clear();
              ref.read(_catalogStateProvider.notifier).update((s) {
                if (s.level == _CatalogLevel.products) {
                  return _CatalogState(
                      level: _CatalogLevel.categories, brand: s.brand);
                }
                return const _CatalogState();
              });
            },
            onCart: () => context.push('/orders/create'),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: RbSearchInput(
              controller: _searchCtrl,
              placeholder: state.level == _CatalogLevel.brands
                  ? 'Search brands'
                  : state.level == _CatalogLevel.categories
                      ? 'Search categories'
                      : 'Search products',
              onChanged: _setQ,
            ),
          ),
          Expanded(
            child: _CatalogBody(state: state),
          ),
        ],
      ),
    );
  }
}

// ─── Top bar ───────────────────────────────────────────────────────────────────

class _CatalogTopBar extends StatelessWidget {
  const _CatalogTopBar({
    required this.level,
    required this.brand,
    required this.category,
    required this.cartCount,
    required this.onBack,
    required this.onCart,
  });
  final _CatalogLevel level;
  final Brand? brand;
  final Category? category;
  final int cartCount;
  final VoidCallback onBack;
  final VoidCallback onCart;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final showBack = level != _CatalogLevel.brands;

    return RbTopBar(
      leading: showBack
          ? GestureDetector(
              onTap: onBack,
              child: Icon(Icons.arrow_back, size: 20, color: c.ink),
            )
          : null,
      title: level == _CatalogLevel.brands
          ? 'Catalog'
          : level == _CatalogLevel.categories
              ? (brand?.name ?? 'Categories')
              : (category?.name ?? brand?.name ?? 'Products'),
      actions: [
        RbIconBtn(
          icon: Icons.shopping_cart_outlined,
          badge: cartCount > 0 ? cartCount : null,
          onTap: onCart,
        ),
      ],
    );
  }
}

// ─── Body ──────────────────────────────────────────────────────────────────────

class _CatalogBody extends ConsumerWidget {
  const _CatalogBody({required this.state});
  final _CatalogState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (state.level) {
      case _CatalogLevel.brands:
        return _BrandsLevel(q: state.q);
      case _CatalogLevel.categories:
        return _CategoriesLevel(brand: state.brand!, q: state.q);
      case _CatalogLevel.products:
        return _ProductsLevel(
          brandId: state.brand?.id,
          categoryId: state.category?.id,
          q: state.q,
        );
    }
  }
}

// ─── Brands level ──────────────────────────────────────────────────────────────

class _BrandsLevel extends ConsumerWidget {
  const _BrandsLevel({this.q});
  final String? q;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_brandsProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2, color: RbColors.accent)),
      error: (e, _) => RbEmpty(icon: Icons.error_outline, title: 'Failed to load brands', sub: e.toString()),
      data: (brands) {
        final filtered = q == null
            ? brands
            : brands.where((b) => b.name.toLowerCase().contains(q!.toLowerCase())).toList();
        if (filtered.isEmpty) {
          return const RbEmpty(icon: Icons.search_off, title: 'No brands found');
        }
        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.1,
          ),
          itemCount: filtered.length,
          itemBuilder: (ctx, i) => _BrandTile(
            brand: filtered[i],
            onTap: () {
              ref.read(_catalogStateProvider.notifier).update(
                    (s) => s.copyWith(
                      level: _CatalogLevel.categories,
                      brand: filtered[i],
                      clearQ: true,
                    ),
                  );
            },
          ),
        );
      },
    );
  }
}

class _BrandTile extends StatelessWidget {
  const _BrandTile({required this.brand, required this.onTap});
  final Brand brand;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbCard(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ProductTile(brandId: brand.id, color: brand.color, size: 40),
            const SizedBox(height: 10),
            Text(brand.name,
                style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: c.ink)),
            if (brand.tagline != null)
              Text(brand.tagline!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      GoogleFonts.inter(fontSize: 12, color: c.muted)),
            const Spacer(),
            if (brand.productCount != null)
              Text('${brand.productCount} products',
                  style: GoogleFonts.inter(
                      fontSize: 11, color: c.muted2)),
          ],
        ),
      ),
    );
  }
}

// ─── Categories level ──────────────────────────────────────────────────────────

class _CategoriesLevel extends ConsumerWidget {
  const _CategoriesLevel({required this.brand, this.q});
  final Brand brand;
  final String? q;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_categoriesProvider(brand.id));

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2, color: RbColors.accent)),
      error: (e, _) => RbEmpty(icon: Icons.error_outline, title: 'Failed to load categories'),
      data: (categories) {
        final filtered = q == null
            ? categories
            : categories.where((c) => c.name.toLowerCase().contains(q!.toLowerCase())).toList();

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
          children: [
            // "All [brand] products" row
            RbCard(
              onTap: () => ref.read(_catalogStateProvider.notifier).update(
                    (s) => s.copyWith(
                      level: _CatalogLevel.products,
                      category: null,
                      clearQ: true,
                    ),
                  ),
              child: RbRow(
                isFirst: true,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'All ${brand.name} products',
                        style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: rbColors(context).ink),
                      ),
                    ),
                    if (brand.productCount != null)
                      RbChip(label: '${brand.productCount}', tone: RbTone.neutral),
                    const SizedBox(width: 6),
                    Icon(Icons.chevron_right,
                        size: 16, color: rbColors(context).muted),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (filtered.isEmpty)
              const RbEmpty(icon: Icons.category_outlined, title: 'No categories')
            else
              RbCard(
                child: Column(
                  children: [
                    for (int i = 0; i < filtered.length; i++)
                      _CategoryRow(
                        category: filtered[i],
                        isFirst: i == 0,
                        onTap: () =>
                            ref.read(_catalogStateProvider.notifier).update(
                                  (s) => s.copyWith(
                                    level: _CatalogLevel.products,
                                    category: filtered[i],
                                    clearQ: true,
                                  ),
                                ),
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.category, required this.isFirst, required this.onTap});
  final Category category;
  final bool isFirst;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
              child: Text(category.name,
                  style: GoogleFonts.inter(fontSize: 14, color: c.ink))),
          if (category.productCount != null)
            RbChip(
                label: '${category.productCount}', tone: RbTone.neutral),
          const SizedBox(width: 6),
          Icon(Icons.chevron_right, size: 16, color: c.muted),
        ],
      ),
    );
  }
}

// ─── Products level ────────────────────────────────────────────────────────────

class _ProductsLevel extends ConsumerWidget {
  const _ProductsLevel({this.brandId, this.categoryId, this.q});
  final String? brandId;
  final String? categoryId;
  final String? q;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(
        _productsProvider((brandId: brandId, categoryId: categoryId, q: q)));

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2, color: RbColors.accent)),
      error: (e, _) => RbEmpty(icon: Icons.error_outline, title: 'Failed to load products'),
      data: (result) {
        if (result.items.isEmpty) {
          return const RbEmpty(
              icon: Icons.search_off, title: 'No products found');
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
          itemCount: result.items.length,
          separatorBuilder: (_, __) => const SizedBox(height: 6),
          itemBuilder: (ctx, i) => _ProductRow(product: result.items[i]),
        );
      },
    );
  }
}

class _ProductRow extends ConsumerWidget {
  const _ProductRow({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final cartItem = cart.items.where((i) => i.product.id == product.id).firstOrNull;
    final inCart = cartItem != null;
    final c = rbColors(context);

    return RbCard(
      onTap: () => context.push('/catalog/product/${product.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            ProductTile(
                brandId: product.brandId ?? product.categoryId,
                size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name,
                      style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: c.ink)),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(product.sku,
                          style: GoogleFonts.jetBrainsMono(
                              fontSize: 11, color: c.muted)),
                      if (product.stock != null) ...[
                        const SizedBox(width: 8),
                        RbChip(
                          label: 'Stock ${product.stock}',
                          tone: (product.stock ?? 0) > 0
                              ? RbTone.success
                              : RbTone.danger,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(fmtMoney(product.basePriceNum),
                          style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: c.ink)),
                      if (product.mrpNum > 0 &&
                          product.mrpNum > product.basePriceNum) ...[
                        const SizedBox(width: 6),
                        Text(fmtMoney(product.mrpNum),
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: c.muted2,
                              decoration: TextDecoration.lineThrough,
                            )),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            inCart
                ? _CartStepper(product: product, qty: cartItem.qty)
                : SizedBox(
                    width: 68,
                    child: RbBtn(
                      label: 'Add',
                      variant: RbBtnVariant.accent,
                      size: RbBtnSize.sm,
                      onPressed: () {
                        ref.read(cartProvider.notifier).addProduct(
                            product, product.basePrice ?? '0');
                        RbToast.show(context, '${product.name} added');
                      },
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}

class _CartStepper extends ConsumerWidget {
  const _CartStepper({required this.product, required this.qty});
  final Product product;
  final int qty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RbQtyStepper(
      qty: qty,
      size: RbQtySize.sm,
      onDecrement: () {
        if (qty <= 1) {
          ref.read(cartProvider.notifier).removeProduct(product.id);
        } else {
          ref.read(cartProvider.notifier).updateQty(product.id, qty - 1);
        }
      },
      onIncrement: () =>
          ref.read(cartProvider.notifier).updateQty(product.id, qty + 1),
    );
  }
}
