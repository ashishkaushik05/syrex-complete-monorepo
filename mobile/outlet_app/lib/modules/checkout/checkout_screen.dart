import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/orders_client.dart';
import '../../core/cart/cart_provider.dart';
import '../../core/models/order.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/product_image.dart';
import '../../shared/widgets/qty_stepper.dart';
import '../../app/theme_provider.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _addressCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String _priority = 'medium';
  bool _loading = false;

  @override
  void dispose() {
    _addressCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) return;

    if (_addressCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a delivery address')),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      final outletId = ref.read(sessionControllerProvider).outletId;
      final lines = cart.values
          .map((e) => CreateOrderLineInput(
                productId: e.product.id,
                qtyOrdered: e.qty,
                unitPrice: e.product.basePrice,
              ))
          .toList();

      final order = await ref.read(ordersClientProvider).create(
            CreateOrderInput(
              outletId: outletId,
              deliveryAddress: _addressCtrl.text.trim(),
              priority: _priority,
              lines: lines,
              notes: _notesCtrl.text.trim().isEmpty
                  ? null
                  : _notesCtrl.text.trim(),
            ),
          );

      ref.read(cartProvider.notifier).clear();
      if (mounted) {
        // Pop checkout, then navigate to the new order
        context.pop();
        context.push('/orders/${order.id}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to place order: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final cart = ref.watch(cartProvider);
    final items = cart.values.toList();

    if (cart.isEmpty) {
      return Scaffold(
        backgroundColor: c.bg,
        body: Column(
          children: [
            OutletAppBar(title: 'Checkout', c: c, showBack: true),
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.shopping_cart_outlined,
                        size: 48, color: c.textFaint),
                    const SizedBox(height: 12),
                    Text('Your cart is empty',
                        style: AppTextStyles.labelBold(color: c.textMute)),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    final subtotal = cartSubtotal(cart);
    final taxBreakdown = cartTaxBreakdown(cart);
    final totalGst = cartTotalGst(cart);
    final grandTotal = cartGrandTotal(cart);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          OutletAppBar(title: 'Checkout', c: c, showBack: true),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Cart Items ────────────────────────────────
                  _SectionHeader(title: 'Items', c: c),
                  const SizedBox(height: 8),
                  ...items.asMap().entries.map((entry) {
                    final i = entry.key;
                    final item = entry.value;
                    final hue = (i * 47 + 160) % 360;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: c.surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: c.accentBorder),
                          boxShadow: [c.shadow],
                        ),
                        child: Row(
                          children: [
                            ProductImage(
                              imageUrl: item.product.primaryImageUrl,
                              hue: hue,
                              size: 44,
                              radius: 10,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.product.displayTitle,
                                    style: AppTextStyles.labelBold(
                                        color: c.text),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 2),
                                  Row(
                                    children: [
                                      Text(
                                        fmtINR(parseAmount(
                                            item.product.basePrice)),
                                        style: AppTextStyles.smallLabel(
                                            color: c.textMute),
                                      ),
                                      const SizedBox(width: 4),
                                      Text('×',
                                          style: AppTextStyles.smallLabel(
                                              color: c.textFaint)),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${item.qty}',
                                        style: AppTextStyles.smallLabel(
                                            color: c.textMute),
                                      ),
                                      const Spacer(),
                                      Text(
                                        fmtINR(
                                          parseAmount(item.product
                                                  .basePrice) *
                                              item.qty,
                                        ),
                                        style: AppTextStyles.smallLabelBold(
                                            color: c.text),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            QtyStepper(
                              value: item.qty,
                              c: c,
                              onChange: (v) => ref
                                  .read(cartProvider.notifier)
                                  .setQty(item.product, v),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),

                  const SizedBox(height: 20),

                  // ── Order Summary ─────────────────────────────
                  _SectionHeader(title: 'Order Summary', c: c),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: c.line),
                      boxShadow: [c.shadow],
                    ),
                    child: Column(
                      children: [
                        _SummaryRow(
                          label: 'Subtotal',
                          value: fmtINR(subtotal, paise: true),
                          c: c,
                        ),
                        if (taxBreakdown.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Divider(color: c.line, height: 16),
                          // Show CGST + SGST per rate
                          ...taxBreakdown.expand((t) {
                            final half = t.rate / 2;
                            return [
                              _SummaryRow(
                                label:
                                    'CGST (${_fmtRate(half)}%)',
                                value: fmtINR(t.cgst, paise: true),
                                c: c,
                                muted: true,
                              ),
                              const SizedBox(height: 2),
                              _SummaryRow(
                                label:
                                    'SGST (${_fmtRate(half)}%)',
                                value: fmtINR(t.sgst, paise: true),
                                c: c,
                                muted: true,
                              ),
                              const SizedBox(height: 2),
                            ];
                          }),
                          _SummaryRow(
                            label: 'Total GST',
                            value: fmtINR(totalGst, paise: true),
                            c: c,
                          ),
                        ],
                        Divider(color: c.line, height: 20),
                        _SummaryRow(
                          label: 'Total',
                          value: fmtINR(grandTotal, paise: true),
                          c: c,
                          bold: true,
                        ),
                        if (taxBreakdown.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            'GST shown is estimated based on product rates. Actual tax as per invoice.',
                            style: AppTextStyles.caption(color: c.textFaint),
                          ),
                        ],
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // ── Delivery Details ──────────────────────────
                  _SectionHeader(title: 'Delivery Details', c: c),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: c.line),
                      boxShadow: [c.shadow],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Delivery address',
                            style: AppTextStyles.smallLabelBold(
                                color: c.textMute)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _addressCtrl,
                          style: AppTextStyles.label(color: c.text),
                          maxLines: 2,
                          decoration: InputDecoration(
                            hintText: 'Full delivery address',
                            hintStyle:
                                AppTextStyles.label(color: c.textFaint),
                            filled: true,
                            fillColor: c.sunken,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 11),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text('Priority',
                            style: AppTextStyles.smallLabelBold(
                                color: c.textMute)),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String>(
                          value: _priority,
                          dropdownColor: c.surface,
                          style: AppTextStyles.label(color: c.text),
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: c.sunken,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 11),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                          ),
                          items: const [
                            DropdownMenuItem(
                                value: 'low', child: Text('Low')),
                            DropdownMenuItem(
                                value: 'medium', child: Text('Medium')),
                            DropdownMenuItem(
                                value: 'high', child: Text('High')),
                          ],
                          onChanged: (v) =>
                              setState(() => _priority = v ?? 'medium'),
                        ),
                        const SizedBox(height: 14),
                        Text('Notes (optional)',
                            style: AppTextStyles.smallLabelBold(
                                color: c.textMute)),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _notesCtrl,
                          style: AppTextStyles.label(color: c.text),
                          maxLines: 3,
                          decoration: InputDecoration(
                            hintText: 'Any special instructions…',
                            hintStyle:
                                AppTextStyles.label(color: c.textFaint),
                            filled: true,
                            fillColor: c.sunken,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 11),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
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

          // ── Place Order button ────────────────────────────────
          Container(
            decoration: BoxDecoration(
              color: c.surface,
              border: Border(top: BorderSide(color: c.line)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.07),
                  blurRadius: 20,
                  offset: const Offset(0, -4),
                )
              ],
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
                child: AppButton(
                  label: 'Place order · ${fmtINR(grandTotal, paise: true)}',
                  c: c,
                  fullWidth: true,
                  loading: _loading,
                  size: AppButtonSize.lg,
                  onTap: _loading ? null : _placeOrder,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fmtRate(double rate) {
    if (rate == rate.truncate()) return rate.toInt().toString();
    return rate.toStringAsFixed(1);
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final AppThemeColors c;
  const _SectionHeader({required this.title, required this.c});

  @override
  Widget build(BuildContext context) => Text(
        title,
        style: AppTextStyles.sectionTitle(color: c.text),
      );
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final AppThemeColors c;
  final bool muted;
  final bool bold;

  const _SummaryRow({
    required this.label,
    required this.value,
    required this.c,
    this.muted = false,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    final labelStyle = bold
        ? AppTextStyles.labelBold(color: c.text)
        : muted
            ? AppTextStyles.label(color: c.textMute)
            : AppTextStyles.label(color: c.text);
    final valueStyle = bold
        ? AppTextStyles.amountMd(color: c.text)
        : muted
            ? AppTextStyles.label(color: c.textMute)
            : AppTextStyles.labelBold(color: c.text);

    return Row(
      children: [
        Expanded(child: Text(label, style: labelStyle)),
        Text(value, style: valueStyle),
      ],
    );
  }
}
