import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/catalog_client.dart';
import '../../modules/orders/cart_provider.dart';
import '../../shared/widgets/rb_components.dart';

final _productDetailProvider =
    FutureProvider.autoDispose.family<Product, String>((ref, id) {
  return ref.watch(catalogClientProvider).productById(id);
});

class ProductDetailPage extends ConsumerStatefulWidget {
  const ProductDetailPage({super.key, required this.productId});
  final String productId;

  @override
  ConsumerState<ProductDetailPage> createState() => _ProductDetailPageState();
}

class _ProductDetailPageState extends ConsumerState<ProductDetailPage> {
  int _qty = 1;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_productDetailProvider(widget.productId));
    final cart = ref.watch(cartProvider);
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                strokeWidth: 2, color: RbColors.accent)),
        error: (e, _) => Center(
            child: RbEmpty(
                icon: Icons.error_outline,
                title: 'Product not found',
                sub: e.toString())),
        data: (product) {
          final inCart = cart.items.any((i) => i.product.id == product.id);
          final saveAmt = product.mrpNum - product.basePriceNum;
          final savePct = product.mrpNum > 0
              ? (saveAmt / product.mrpNum * 100).round()
              : 0;

          return Stack(
            children: [
              CustomScrollView(
                slivers: [
                  SliverAppBar(
                    expandedHeight: 220,
                    pinned: true,
                    backgroundColor: c.surface,
                    leading: IconButton(
                      icon: Icon(Icons.arrow_back, color: c.ink),
                      onPressed: () => context.pop(),
                    ),
                    title: Text(product.sku,
                        style: GoogleFonts.jetBrainsMono(
                            fontSize: 13, color: c.muted)),
                    flexibleSpace: FlexibleSpaceBar(
                      background: _HeroTile(product: product),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                    sliver: SliverList(
                      delegate: SliverChildListDelegate([
                        // Name
                        Text(product.name,
                            style: GoogleFonts.inter(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: c.ink)),
                        const SizedBox(height: 10),

                        // Price row
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(fmtMoney(product.basePriceNum),
                                style: GoogleFonts.inter(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w700,
                                    color: c.ink,
                                    fontFeatures: const [
                                      FontFeature.tabularFigures()
                                    ])),
                            if (product.mrpNum > product.basePriceNum) ...[
                              const SizedBox(width: 8),
                              Padding(
                                padding: const EdgeInsets.only(bottom: 2),
                                child: Text(fmtMoney(product.mrpNum),
                                    style: GoogleFonts.inter(
                                      fontSize: 14,
                                      color: c.muted2,
                                      decoration: TextDecoration.lineThrough,
                                    )),
                              ),
                              const SizedBox(width: 8),
                              RbChip(
                                  label: 'Save $savePct%',
                                  tone: RbTone.success),
                            ],
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Chips row
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            if (product.stock != null)
                              RbChip(
                                label: 'Stock: ${product.stock}',
                                tone: (product.stock ?? 0) > 0
                                    ? RbTone.success
                                    : RbTone.danger,
                              ),
                            if (product.warrantyMonths != null)
                              RbChip(
                                label: '${product.warrantyMonths}mo warranty',
                                tone: RbTone.info,
                              ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Description
                        if (product.description != null &&
                            product.description!.isNotEmpty) ...[
                          RbSection(label: 'Description'),
                          const SizedBox(height: 8),
                          RbCard(
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Text(product.description!,
                                  style: GoogleFonts.inter(
                                      fontSize: 14,
                                      color: c.ink2,
                                      height: 1.5)),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Specs
                        if (product.specs.isNotEmpty) ...[
                          RbSection(label: 'Specifications'),
                          const SizedBox(height: 8),
                          RbCard(
                            child: Column(
                              children: [
                                for (int i = 0;
                                    i < product.specs.length;
                                    i++)
                                  RbRow(
                                    isFirst: i == 0,
                                    child: Row(
                                      children: [
                                        SizedBox(
                                          width: 120,
                                          child: Text(product.specs[i].k,
                                              style: GoogleFonts.inter(
                                                  fontSize: 13,
                                                  color: c.muted)),
                                        ),
                                        Expanded(
                                          child: Text(product.specs[i].v,
                                              style: GoogleFonts.inter(
                                                  fontSize: 13,
                                                  color: c.ink)),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ]),
                    ),
                  ),
                ],
              ),

              // Sticky bottom bar
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  decoration: BoxDecoration(
                    color: c.surface,
                    border: Border(
                        top: BorderSide(color: c.line, width: 0.5)),
                  ),
                  padding: EdgeInsets.fromLTRB(
                      16,
                      12,
                      16,
                      12 + MediaQuery.of(context).padding.bottom),
                  child: Row(
                    children: [
                      RbQtyStepper(
                        qty: _qty,
                        onDecrement:
                            _qty > 1 ? () => setState(() => _qty--) : null,
                        onIncrement: () => setState(() => _qty++),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: RbBtn(
                          label: inCart
                              ? 'Update cart · ${fmtMoney(product.basePriceNum * _qty)}'
                              : 'Add · ${fmtMoney(product.basePriceNum * _qty)}',
                          variant: RbBtnVariant.accent,
                          size: RbBtnSize.lg,
                          onPressed: () {
                            if (inCart) {
                              ref
                                  .read(cartProvider.notifier)
                                  .updateQty(product.id, _qty);
                            } else {
                              ref.read(cartProvider.notifier).addProduct(
                                  product, product.basePrice ?? '0');
                              if (_qty > 1) {
                                ref
                                    .read(cartProvider.notifier)
                                    .updateQty(product.id, _qty);
                              }
                            }
                            RbToast.show(context, 'Cart updated');
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _HeroTile extends StatelessWidget {
  const _HeroTile({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    final color = brandColorForId(product.brandId ?? product.categoryId);
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [color.withOpacity(0.18), color.withOpacity(0.06)],
        ),
      ),
      child: Center(
        child: Icon(Icons.inventory_2_outlined, size: 72, color: color),
      ),
    );
  }
}
