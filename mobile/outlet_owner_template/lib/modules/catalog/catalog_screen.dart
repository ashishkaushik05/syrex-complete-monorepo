import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/api/catalog_client.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_typography.dart';
import 'package:outlet_owner_template/core/design/money_formatter.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_search_input.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';

// Riverpod filter state for catalog
final _catalogFilterProvider = StateProvider.autoDispose<
    ({String? brandId, String? categoryId, String? q})>(
  (_) => (brandId: null, categoryId: null, q: null),
);

/// Cart item representation for passing to parent
class CartItem {
  final String productId;
  final String productName;
  final num price;
  int qty;

  CartItem({
    required this.productId,
    required this.productName,
    required this.price,
    this.qty = 1,
  });
}

/// CatalogScreen: 3-level hierarchy (brands -> categories -> products)
/// Manages search state, brand/category filters, and product display with quantity selectors.
class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({
    super.key,
    this.cart = const [],
    this.onAddToCart,
  });

  final List<CartItem> cart;
  final void Function(Product, int qty)? onAddToCart;

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final _searchCtrl = TextEditingController();
  final _expandedCategories = <String>{};

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final filter = ref.watch(_catalogFilterProvider);
    final brands = ref.watch(brandsProvider);
    final products = ref.watch(productsProvider((brandId: filter.brandId, categoryId: filter.categoryId, q: filter.q)));

    return Scaffold(
      backgroundColor: cs.bg,
      body: Column(
        children: [
          // Top bar
          RbTopBar(
            title: 'Catalog',
            frosted: true,
            actions: [
              GestureDetector(
                onTap: () {},
                child: Container(
                  height: 36,
                  width: 36,
                  decoration: BoxDecoration(
                    color: cs.surface2,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  child: Center(
                    child: RbIcon('grid', size: 18, color: cs.ink),
                  ),
                ),
              ),
            ],
          ),
          // Search input
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: RbSearchInput(
              controller: _searchCtrl,
              placeholder: 'Search products…',
              onChanged: (v) => ref.read(_catalogFilterProvider.notifier).state = (
                brandId: filter.brandId,
                categoryId: filter.categoryId,
                q: v.isEmpty ? null : v,
              ),
            ),
          ),
          // Brand filter chips (horizontal scrollable)
          brands.maybeWhen(
            data: (brandList) => SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _BrandChip(
                    label: 'All',
                    selected: filter.brandId == null,
                    onTap: () => ref.read(_catalogFilterProvider.notifier).state = (
                      brandId: null,
                      categoryId: filter.categoryId,
                      q: filter.q,
                    ),
                  ),
                  ...brandList.map((b) => _BrandChip(
                        label: b.name,
                        selected: filter.brandId == b.id,
                        onTap: () => ref.read(_catalogFilterProvider.notifier).state = (
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
          const SizedBox(height: 8),
          // Products list grouped by category
          Expanded(
            child: products.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Failed to load products',
                        style: AppTextStyles.h3(cs.ink),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        e.toString(),
                        style: AppTextStyles.body(cs.ink2),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
              data: (result) {
                final items = result.items;
                if (items.isEmpty) {
                  return Center(
                    child: Text(
                      'No products found',
                      style: AppTextStyles.body(cs.ink2),
                    ),
                  );
                }

                // Group products by category and track first product's category name
                final grouped = <String, (List<Product>, String)>{};
                for (final p in items) {
                  if (grouped.containsKey(p.categoryId)) {
                    grouped[p.categoryId]!.$1.add(p);
                  } else {
                    grouped[p.categoryId] = ([p], p.categoryId); // Use categoryId as fallback for name
                  }
                }

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                  itemCount: grouped.length,
                  itemBuilder: (_, idx) {
                    final categoryId = grouped.keys.toList()[idx];
                    final (categoryProducts, _) = grouped[categoryId]!;

                    return _CategoryGroup(
                      categoryId: categoryId,
                      products: categoryProducts,
                      isExpanded: _expandedCategories.contains(categoryId),
                      onExpandToggle: (expanded) {
                        setState(() {
                          if (expanded) {
                            _expandedCategories.add(categoryId);
                          } else {
                            _expandedCategories.remove(categoryId);
                          }
                        });
                      },
                      onAddToCart: widget.onAddToCart,
                      cart: widget.cart,
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Brand filter chip (active = accent bg, inactive = surface2)
class _BrandChip extends StatelessWidget {
  const _BrandChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: selected ? cs.accentSoft : cs.surface2,
            borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: AppTextStyles.chip(selected ? cs.accent : cs.ink2),
          ),
        ),
      ),
    );
  }
}

/// Category group with collapsible product rows
class _CategoryGroup extends StatelessWidget {
  const _CategoryGroup({
    required this.categoryId,
    required this.products,
    required this.isExpanded,
    required this.onExpandToggle,
    required this.onAddToCart,
    required this.cart,
  });

  final String categoryId;
  final List<Product> products;
  final bool isExpanded;
  final ValueChanged<bool> onExpandToggle;
  final void Function(Product, int qty)? onAddToCart;
  final List<CartItem> cart;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Column(
      children: [
        // Category header (expandable)
        GestureDetector(
          onTap: () => onExpandToggle(!isExpanded),
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: cs.surface2,
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Category: $categoryId',
                    style: AppTextStyles.h3(cs.ink),
                  ),
                ),
                RbIcon(
                  isExpanded ? 'chev-down' : 'chev-right',
                  size: 16,
                  color: cs.ink2,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        // Product rows (shown when expanded)
        if (isExpanded)
          ...products.map((p) => _ProductRow(
                product: p,
                onAddToCart: onAddToCart,
                inCart: cart.any((item) => item.productId == p.id),
                cartQty: cart.firstWhere((item) => item.productId == p.id, orElse: () => CartItem(productId: '', productName: '', price: 0)).qty,
              )),
        const SizedBox(height: 16),
      ],
    );
  }
}

/// Product row with quantity selector and add-to-cart button
class _ProductRow extends StatefulWidget {
  const _ProductRow({
    required this.product,
    required this.onAddToCart,
    required this.inCart,
    required this.cartQty,
  });

  final Product product;
  final void Function(Product, int qty)? onAddToCart;
  final bool inCart;
  final int cartQty;

  @override
  State<_ProductRow> createState() => _ProductRowState();
}

class _ProductRowState extends State<_ProductRow> {
  late int _qty = widget.inCart ? widget.cartQty : 1;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return RbCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          // Product image placeholder (40x40)
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: cs.surface2,
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
            ),
            alignment: Alignment.center,
            child: Text(
              widget.product.name.substring(0, 1).toUpperCase(),
              style: AppTextStyles.h3(cs.ink2),
            ),
          ),
          const SizedBox(width: 12),
          // Product info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.product.name,
                  style: AppTextStyles.body(cs.ink),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      widget.product.sku,
                      style: AppTextStyles.mono(cs.ink2, size: 11),
                    ),
                    if (widget.product.basePrice != null) ...[
                      Text(' · ', style: AppTextStyles.meta(cs.ink2)),
                      Text(
                        MoneyFormatter.format(num.tryParse(widget.product.basePrice!) ?? 0),
                        style: AppTextStyles.money(cs.ink, size: 12),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Quantity selector + add button
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 100,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Minus button
                    GestureDetector(
                      onTap: _qty > 1 ? () => setState(() => _qty--) : null,
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: cs.surface2,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        ),
                        child: Center(
                          child: RbIcon('minus', size: 14, color: _qty > 1 ? cs.ink : cs.ink2),
                        ),
                      ),
                    ),
                    // Quantity text
                    Text(
                      _qty.toString(),
                      style: AppTextStyles.buttonLabel(cs.ink, size: 13),
                    ),
                    // Plus button
                    GestureDetector(
                      onTap: () => setState(() => _qty++),
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: cs.accent,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        ),
                        child: Center(
                          child: RbIcon('plus', size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Add to cart button
              GestureDetector(
                onTap: () {
                  widget.onAddToCart?.call(widget.product, _qty);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Added $_qty x ${widget.product.name} to cart'),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                },
                child: Container(
                  height: 28,
                  width: 100,
                  decoration: BoxDecoration(
                    color: cs.accent,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    'Add',
                    style: AppTextStyles.buttonLabel(Colors.white, size: 12),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
