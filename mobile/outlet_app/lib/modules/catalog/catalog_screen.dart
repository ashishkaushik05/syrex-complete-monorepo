import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/api/catalog_client.dart';
import '../../core/models/catalog.dart';
import '../../core/cart/cart_provider.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/filter_chip_row.dart';
import '../../shared/widgets/product_image.dart';
import '../../shared/widgets/qty_stepper.dart';
import '../../app/theme_provider.dart';

final _brandsProvider = FutureProvider.autoDispose<List<BrandDto>>(
  (ref) => ref.read(catalogClientProvider).listBrands(),
);

final _productsProvider = FutureProvider.autoDispose
    .family<PagedProducts, ({String? brandId, String? q})>(
  (ref, args) => ref.read(catalogClientProvider).listProducts(
        brandId: args.brandId,
        q: args.q,
      ),
);

class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({super.key});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  String? _brandId;
  final _searchCtrl = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final cart = ref.watch(cartProvider);
    final cartQty = cartTotalQty(cart);
    final brandsAsync = ref.watch(_brandsProvider);
    final productsAsync = ref.watch(
        _productsProvider((brandId: _brandId, q: _q.isEmpty ? null : _q)));

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutletAppBar(
            title: 'Catalog',
            c: c,
            showBack: true,
            trailing: cartQty > 0
                ? GestureDetector(
                    onTap: () => context.push('/checkout'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: c.accent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.shopping_cart_outlined,
                              size: 16, color: Colors.white),
                          const SizedBox(width: 6),
                          Text('$cartQty',
                              style: AppTextStyles.labelBold(
                                  color: Colors.white)),
                        ],
                      ),
                    ),
                  )
                : null,
          ),

          // ── Search ─────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
            child: Container(
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: c.line),
              ),
              child: Row(
                children: [
                  const SizedBox(width: 12),
                  Icon(Icons.search, size: 20, color: c.textFaint),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _searchCtrl,
                      style: AppTextStyles.label(color: c.text),
                      decoration: InputDecoration(
                        hintText: 'Search products…',
                        hintStyle: AppTextStyles.label(color: c.textFaint),
                        border: InputBorder.none,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onChanged: (v) => setState(() => _q = v),
                    ),
                  ),
                  if (_q.isNotEmpty)
                    GestureDetector(
                      onTap: () {
                        _searchCtrl.clear();
                        setState(() => _q = '');
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child:
                            Icon(Icons.close, size: 18, color: c.textFaint),
                      ),
                    ),
                ],
              ),
            ),
          ),

          // ── Brand filter ────────────────────────────────────
          brandsAsync.whenData((brands) {
            if (brands.isEmpty) return const SizedBox.shrink();
            final chips = ['All', ...brands.map((b) => b.name)];
            return Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
              child: FilterChipRow(
                chips: chips,
                selected: _brandId == null
                    ? 'All'
                    : brands
                        .firstWhere((b) => b.id == _brandId,
                            orElse: () => brands.first)
                        .name,
                onSelect: (name) {
                  if (name == 'All') {
                    setState(() => _brandId = null);
                  } else {
                    final brand =
                        brands.firstWhere((b) => b.name == name);
                    setState(() => _brandId = brand.id);
                  }
                },
                c: c,
              ),
            );
          }).valueOrNull ??
              const SizedBox.shrink(),

          // ── Grid ────────────────────────────────────────────
          Expanded(
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () async => ref.invalidate(_productsProvider),
              child: productsAsync.when(
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(children: [
                      EmptyState(
                        icon: Icons.category_outlined,
                        title: 'No products found',
                        sub: 'Try adjusting your search or brand filter.',
                        c: c,
                      ),
                    ]);
                  }
                  return GridView.builder(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      mainAxisExtent: 272,
                    ),
                    itemCount: page.items.length,
                    itemBuilder: (_, i) => _ProductCard(
                      product: page.items[i],
                      c: c,
                      index: i,
                    ),
                  );
                },
                loading: () => _Skeleton(c: c),
                error: (_, __) => Center(
                  child: Text('Failed to load catalog',
                      style: TextStyle(color: c.textMute)),
                ),
              ),
            ),
          ),

          // ── Cart sticky bar ─────────────────────────────────
          if (cartQty > 0)
            _CartStickyBar(c: c, cart: cart),
        ],
      ),
    );
  }
}

class _ProductCard extends ConsumerWidget {
  final ProductDto product;
  final AppThemeColors c;
  final int index;
  const _ProductCard(
      {required this.product, required this.c, required this.index});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hue = (index * 47 + 160) % 360;
    final cart = ref.watch(cartProvider);
    final qty = cart[product.id]?.qty ?? 0;

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: qty > 0 ? c.accentBorder : c.line),
        boxShadow: [c.shadow],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Image area ─────────────────────────────────────
          ClipRRect(
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(17)),
            child: SizedBox(
              height: 112,
              width: double.infinity,
              child: product.primaryImageUrl != null
                  ? _FullImage(
                      imageUrl: product.primaryImageUrl!, hue: hue, c: c)
                  : _ThumbFill(hue: hue),
            ),
          ),

          // ── Text + cart area ───────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.displayTitle,
                        style: AppTextStyles.labelBold(color: c.text),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        product.sku,
                        style: AppTextStyles.caption(color: c.textFaint),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        fmtINR(parseAmount(product.basePrice)),
                        style: AppTextStyles.smallLabelBold(color: c.text),
                      ),
                      const SizedBox(height: 6),
                      QtyStepper(
                        value: qty,
                        c: c,
                        onChange: (v) => ref
                            .read(cartProvider.notifier)
                            .setQty(product, v),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CartStickyBar extends StatelessWidget {
  final AppThemeColors c;
  final Map<String, CartItem> cart;
  const _CartStickyBar({required this.c, required this.cart});

  @override
  Widget build(BuildContext context) {
    final qty = cartTotalQty(cart);
    final total = cartGrandTotal(cart);
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.line)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          )
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
          child: GestureDetector(
            onTap: () => context.push('/checkout'),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: c.accent,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [c.shadow],
              ),
              child: Row(
                children: [
                  const Icon(Icons.shopping_cart_outlined,
                      size: 20, color: Colors.white),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '$qty item${qty == 1 ? '' : 's'} in cart',
                      style:
                          AppTextStyles.labelBold(color: Colors.white),
                    ),
                  ),
                  Text(
                    fmtINR(total, paise: true),
                    style: AppTextStyles.labelBold(color: Colors.white),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward_ios,
                      size: 14, color: Colors.white),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FullImage extends StatelessWidget {
  final String imageUrl;
  final int hue;
  final AppThemeColors c;
  const _FullImage(
      {required this.imageUrl, required this.hue, required this.c});

  @override
  Widget build(BuildContext context) {
    return ProductImage(
      imageUrl: imageUrl,
      hue: hue,
      fill: true,
      radius: 0,
      fit: BoxFit.cover,
    );
  }
}

class _ThumbFill extends StatelessWidget {
  final int hue;
  const _ThumbFill({required this.hue});

  @override
  Widget build(BuildContext context) {
    final light =
        HSLColor.fromAHSL(1, hue.toDouble(), 0.55, 0.88).toColor();
    final mid =
        HSLColor.fromAHSL(1, hue.toDouble(), 0.48, 0.80).toColor();
    final iconColor =
        HSLColor.fromAHSL(1, hue.toDouble(), 0.40, 0.42).toColor();
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: const Alignment(-0.5, -0.8),
          end: const Alignment(0.8, 0.8),
          colors: [light, mid],
        ),
      ),
      child: Center(
        child: Icon(Icons.electrical_services, size: 40, color: iconColor),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  final AppThemeColors c;
  const _Skeleton({required this.c});

  @override
  Widget build(BuildContext context) => GridView.builder(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          mainAxisExtent: 272,
        ),
        itemCount: 6,
        itemBuilder: (_, __) => Container(
          decoration: BoxDecoration(
              color: c.sunken,
              borderRadius: BorderRadius.circular(18)),
        ),
      );
}
