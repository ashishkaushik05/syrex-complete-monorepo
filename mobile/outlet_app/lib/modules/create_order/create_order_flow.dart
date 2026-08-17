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
import '../../shared/widgets/product_image.dart';
import '../../shared/widgets/qty_stepper.dart';
import '../../app/theme_provider.dart';

final _catalogProvider = FutureProvider.autoDispose<PagedProducts>(
  (ref) => ref.read(catalogClientProvider).listProducts(limit: 100),
);

class CreateOrderFlow extends ConsumerStatefulWidget {
  const CreateOrderFlow({super.key});

  @override
  ConsumerState<CreateOrderFlow> createState() => _CreateOrderFlowState();
}

class _CreateOrderFlowState extends ConsumerState<CreateOrderFlow> {
  String _q = '';
  final _searchCtrl = TextEditingController();

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
    final cartTotal = cartGrandTotal(cart);
    final catalogAsync = ref.watch(_catalogProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          OutletAppBar(
            title: 'New order',
            c: c,
            showBack: true,
            trailing: cartQty > 0
                ? Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: c.accentSoft,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: c.accentBorder),
                    ),
                    child: Text(
                      '$cartQty item${cartQty == 1 ? '' : 's'} · ${fmtINR(cartTotal)}',
                      style: AppTextStyles.labelBold(color: c.accent),
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
                        child: Icon(Icons.close,
                            size: 18, color: c.textFaint),
                      ),
                    ),
                ],
              ),
            ),
          ),

          // ── Product list ────────────────────────────────────
          Expanded(
            child: catalogAsync.when(
              data: (catalog) {
                final filtered = _q.isEmpty
                    ? catalog.items
                    : catalog.items
                        .where((p) =>
                            p.displayTitle
                                .toLowerCase()
                                .contains(_q.toLowerCase()) ||
                            p.sku
                                .toLowerCase()
                                .contains(_q.toLowerCase()))
                        .toList();
                return ListView.separated(
                  padding: EdgeInsets.fromLTRB(
                      18, 0, 18, cartQty > 0 ? 100 : 24),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final product = filtered[i];
                    final qty = cart[product.id]?.qty ?? 0;
                    return _ProductRow(
                      product: product,
                      qty: qty,
                      index: i,
                      c: c,
                      onQtyChange: (v) => ref
                          .read(cartProvider.notifier)
                          .setQty(product, v),
                    );
                  },
                );
              },
              loading: () => _Skeleton(c: c),
              error: (_, __) => Center(
                child: Text('Failed to load products',
                    style: TextStyle(color: c.textMute)),
              ),
            ),
          ),
        ],
      ),
      // ── Go to checkout bar ──────────────────────────────────
      bottomNavigationBar: cartQty > 0
          ? _CheckoutBar(c: c, qty: cartQty, total: cartTotal)
          : null,
    );
  }
}

class _ProductRow extends StatelessWidget {
  final ProductDto product;
  final int qty;
  final int index;
  final AppThemeColors c;
  final ValueChanged<int> onQtyChange;

  const _ProductRow({
    required this.product,
    required this.qty,
    required this.index,
    required this.c,
    required this.onQtyChange,
  });

  @override
  Widget build(BuildContext context) {
    final hue = (index * 47 + 160) % 360;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: qty > 0 ? c.accentBorder : c.line),
        boxShadow: [c.shadow],
      ),
      child: Row(
        children: [
          ProductImage(
              imageUrl: product.primaryImageUrl,
              hue: hue,
              size: 48,
              radius: 12),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.displayTitle,
                    style: AppTextStyles.labelBold(color: c.text),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(fmtINR(parseAmount(product.basePrice)),
                    style:
                        AppTextStyles.smallLabelBold(color: c.accent)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          QtyStepper(value: qty, onChange: onQtyChange, c: c),
        ],
      ),
    );
  }
}

class _CheckoutBar extends StatelessWidget {
  final AppThemeColors c;
  final int qty;
  final double total;
  const _CheckoutBar(
      {required this.c, required this.qty, required this.total});

  @override
  Widget build(BuildContext context) {
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
              padding: const EdgeInsets.symmetric(
                  horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: c.accent,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [c.shadow],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$qty item${qty == 1 ? '' : 's'} in cart',
                          style: AppTextStyles.smallLabel(
                              color: Colors.white70),
                        ),
                        Text(
                          fmtINR(total, paise: true),
                          style:
                              AppTextStyles.amountMd(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                  Text('Review & checkout',
                      style:
                          AppTextStyles.labelBold(color: Colors.white)),
                  const SizedBox(width: 6),
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

class _Skeleton extends StatelessWidget {
  final AppThemeColors c;
  const _Skeleton({required this.c});

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        itemCount: 8,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, __) => Container(
          height: 72,
          decoration: BoxDecoration(
              color: c.sunken,
              borderRadius: BorderRadius.circular(16)),
        ),
      );
}
