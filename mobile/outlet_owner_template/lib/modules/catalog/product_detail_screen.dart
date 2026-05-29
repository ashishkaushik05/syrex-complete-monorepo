import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/api/catalog_client.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_typography.dart';
import 'package:outlet_owner_template/core/design/money_formatter.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';

/// ProductDetailScreen: Full product information with quantity selector and add to cart
///
/// Displays:
/// - Top bar with back button and product name
/// - Large product image placeholder (160px height, rounded, surface2 background)
/// - Product name (h1 style), category chip, price (large rb-money)
/// - Description/SKU row
/// - Quantity stepper (minus/plus buttons)
/// - "Add to cart" primary button (sticky at bottom)
class ProductDetailScreen extends ConsumerStatefulWidget {
  const ProductDetailScreen({
    super.key,
    required this.productId,
    this.onBack,
    this.onAddToCart,
  });

  final String productId;
  final VoidCallback? onBack;
  final void Function(Product, int qty)? onAddToCart;

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int _qty = 1;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final productAsync = ref.watch(productDetailProvider(widget.productId));

    return productAsync.when(
      loading: () => Scaffold(
        backgroundColor: cs.bg,
        body: Column(
          children: [
            RbTopBar(
              leading: widget.onBack != null
                  ? GestureDetector(
                      onTap: widget.onBack,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: cs.surface2,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        ),
                        child: Center(
                          child: RbIcon('chev-left', size: 18, color: cs.ink),
                        ),
                      ),
                    )
                  : null,
            ),
            const Expanded(
              child: Center(
                child: CircularProgressIndicator(),
              ),
            ),
          ],
        ),
      ),
      error: (error, _) => Scaffold(
        backgroundColor: cs.bg,
        body: Column(
          children: [
            RbTopBar(
              leading: widget.onBack != null
                  ? GestureDetector(
                      onTap: widget.onBack,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: cs.surface2,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                        ),
                        child: Center(
                          child: RbIcon('chev-left', size: 18, color: cs.ink),
                        ),
                      ),
                    )
                  : null,
            ),
            Expanded(
              child: Center(
                child: Text(
                  'Product not found',
                  style: AppTextStyles.h3(cs.ink2),
                ),
              ),
            ),
          ],
        ),
      ),
      data: (product) => _buildProductDetail(context, cs, product),
    );
  }

  Widget _buildProductDetail(BuildContext context, AppColorScheme cs, Product product) {
    return Scaffold(
      backgroundColor: cs.bg,
      body: Column(
        children: [
          // Top bar with back button
          RbTopBar(
            leading: widget.onBack != null
                ? GestureDetector(
                    onTap: widget.onBack,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: cs.surface2,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      ),
                      child: Center(
                        child: RbIcon('chev-left', size: 18, color: cs.ink),
                      ),
                    ),
                  )
                : null,
            title: product.name,
          ),
          // Scrollable content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Product image placeholder (160px height)
                  Container(
                    width: double.infinity,
                    height: 160,
                    decoration: BoxDecoration(
                      color: cs.surface2,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      product.name.substring(0, 1).toUpperCase(),
                      style: TextStyle(
                        fontSize: 72,
                        fontWeight: FontWeight.w600,
                        color: cs.ink2.withAlpha(127),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Product info section
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Product name (h1)
                            Text(
                              product.name,
                              style: AppTextStyles.h2(cs.ink).copyWith(height: 1.3),
                            ),
                            const SizedBox(height: 8),
                            // Category chip
                            RbChip(
                              label: product.categoryId.isNotEmpty ? product.categoryId : 'Uncategorized',
                              variant: RbChipVariant.accent,
                            ),
                          ],
                        ),
                      ),
                      // Price (large rb-money style)
                      Text(
                        MoneyFormatter.format(num.tryParse(product.basePrice ?? '0') ?? 0),
                        style: AppTextStyles.money(cs.accent, size: 28, weight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // Description and SKU row
                  RbCard(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (product.description != null) ...[
                          Text(
                            'Description',
                            style: AppTextStyles.sectionLabel(cs.ink2),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            product.description!,
                            style: AppTextStyles.body(cs.ink),
                          ),
                          const SizedBox(height: 12),
                        ],
                        Text(
                          'SKU',
                          style: AppTextStyles.sectionLabel(cs.ink2),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          product.sku,
                          style: AppTextStyles.mono(cs.ink, size: 13),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  // Quantity stepper section
                  Text(
                    'Quantity',
                    style: AppTextStyles.h3(cs.ink),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: 120,
                    height: 40,
                    decoration: BoxDecoration(
                      color: cs.surface,
                      border: Border.all(color: cs.line, width: AppSpacing.hairline),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    ),
                    child: Row(
                      children: [
                        // Minus button
                        Expanded(
                          child: GestureDetector(
                            onTap: _qty > 1 ? () => setState(() => _qty--) : null,
                            child: Center(
                              child: RbIcon('minus', size: 16, color: _qty > 1 ? cs.ink : cs.ink2),
                            ),
                          ),
                        ),
                        // Divider
                        Container(width: AppSpacing.hairline, color: cs.line),
                        // Quantity display
                        Expanded(
                          child: Center(
                            child: Text(
                              _qty.toString(),
                              style: AppTextStyles.buttonLabel(cs.ink),
                            ),
                          ),
                        ),
                        // Divider
                        Container(width: AppSpacing.hairline, color: cs.line),
                        // Plus button
                        Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _qty++),
                            child: Center(
                              child: RbIcon('plus', size: 16, color: cs.ink),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
          // Sticky add to cart button at bottom
          Container(
            decoration: BoxDecoration(
              color: cs.surface,
              border: Border(top: BorderSide(color: cs.line, width: AppSpacing.hairline)),
            ),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: SafeArea(
              top: false,
              child: RbButton(
                label: 'Add $_qty to cart',
                variant: RbButtonVariant.primary,
                size: RbButtonSize.lg,
                fullWidth: true,
                onPressed: () {
                  widget.onAddToCart?.call(product, _qty);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Added $_qty x ${product.name} to cart'),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                  // Optionally navigate back
                  widget.onBack?.call();
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
