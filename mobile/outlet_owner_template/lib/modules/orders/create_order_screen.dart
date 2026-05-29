import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/design/app_colors.dart';
import '../../core/design/app_spacing.dart';
import '../../core/widgets/rb_card.dart';
import 'cart_provider.dart';

class CreateOrderScreen extends ConsumerStatefulWidget {
  /// Sample cart items passed in. In real app, read from cartProvider
  final List<CartItem>? initialCart;
  final VoidCallback? onBack;
  final void Function(String total)? onSubmit;

  const CreateOrderScreen({
    super.key,
    this.initialCart,
    this.onBack,
    this.onSubmit,
  });

  @override
  ConsumerState<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends ConsumerState<CreateOrderScreen> {
  late int _currentStep;
  late TextEditingController _deliveryAddressCtrl;
  late TextEditingController _notesCtrl;

  @override
  void initState() {
    super.initState();
    _currentStep = 0;
    _deliveryAddressCtrl = TextEditingController();
    _notesCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _deliveryAddressCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final cart = ref.watch(cartProvider);

    if (cart.items.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('New Order')),
        body: Center(
          child: Text(
            'Cart is empty. Add items from catalog.',
            style: TextStyle(color: cs.muted),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_currentStep == 0 ? 'Review Cart' : 'Confirm Order'),
        leading: _currentStep == 0
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() => _currentStep = 0),
              ),
      ),
      body: _currentStep == 0
          ? _buildCartStep(context, cart, cs)
          : _buildConfirmStep(context, cart, cs),
    );
  }

  Widget _buildCartStep(BuildContext context, CartState cart, AppColorScheme cs) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.pad),
      children: [
        // Cart items
        for (final item in cart.items)
          RbCard(
            padding: const EdgeInsets.all(AppSpacing.pad),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        item.product.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        ref
                            .read(cartProvider.notifier)
                            .removeProduct(item.product.id);
                      },
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '₹${item.unitPrice} per unit',
                  style: TextStyle(fontSize: 12, color: cs.muted),
                ),
                const SizedBox(height: 12),
                // Qty stepper
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.remove, size: 18),
                          onPressed: () {
                            ref.read(cartProvider.notifier).updateQty(
                                  item.product.id,
                                  item.qty - 1,
                                );
                          },
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                        SizedBox(
                          width: 40,
                          child: Text(
                            '${item.qty}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.add, size: 18),
                          onPressed: () {
                            ref.read(cartProvider.notifier).updateQty(
                                  item.product.id,
                                  item.qty + 1,
                                );
                          },
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                    Text(
                      '₹${item.lineTotal}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        // Totals breakdown
        RbCard(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Column(
            children: [
              _TotalRow(label: 'Subtotal', value: '₹${cart.grandTotal}'),
              _TotalRow(label: 'Tax (est.)', value: '₹0.00'),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Divider(height: 1),
              ),
              _TotalRow(
                label: 'Total',
                value: '₹${cart.grandTotal}',
                bold: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: () => setState(() => _currentStep = 1),
          child: const Text('Continue to Confirm'),
        ),
      ],
    );
  }

  Widget _buildConfirmStep(BuildContext context, CartState cart, AppColorScheme cs) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.pad),
      children: [
        // Items summary (read-only)
        RbCard(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Order Summary',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              for (final item in cart.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.product.name,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Text(
                              '${item.qty} × ₹${item.unitPrice}',
                              style: TextStyle(
                                fontSize: 12,
                                color: cs.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        '₹${item.lineTotal}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // Outlet info + Delivery address
        RbCard(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Delivery',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _deliveryAddressCtrl,
                minLines: 2,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'Delivery address…',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  isDense: true,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // Notes
        RbCard(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Notes (Optional)',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _notesCtrl,
                minLines: 3,
                maxLines: 5,
                decoration: InputDecoration(
                  hintText: 'Special instructions…',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  isDense: true,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // Totals breakdown
        RbCard(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Column(
            children: [
              _TotalRow(label: 'Subtotal', value: '₹${cart.grandTotal}'),
              _TotalRow(label: 'Tax (est.)', value: '₹0.00'),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Divider(height: 1),
              ),
              _TotalRow(
                label: 'Total',
                value: '₹${cart.grandTotal}',
                bold: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: () {
            widget.onSubmit?.call(cart.grandTotal);
          },
          child: const Text('Place Order'),
        ),
        const SizedBox(height: 80),
      ],
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({
    required this.label,
    required this.value,
    this.bold = false,
  });

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: bold ? FontWeight.w600 : FontWeight.w500,
            color: bold ? cs.ink : cs.muted,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
            color: cs.ink,
          ),
        ),
      ],
    );
  }
}
