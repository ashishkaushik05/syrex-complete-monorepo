import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/orders_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';
import 'cart_provider.dart';

class CreateOrderPage extends ConsumerStatefulWidget {
  const CreateOrderPage({super.key});

  @override
  ConsumerState<CreateOrderPage> createState() => _CreateOrderPageState();
}

class _CreateOrderPageState extends ConsumerState<CreateOrderPage> {
  final _addressCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _submitting = false;
  String? _submitError;

  @override
  void dispose() {
    _addressCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final outletId = ref.read(outletIdProvider);
    if (outletId == null) return;

    final cart = ref.read(cartProvider);
    if (cart.items.isEmpty) return;

    setState(() {
      _submitting = true;
      _submitError = null;
    });

    try {
      final order = await ref.read(ordersClientProvider).createOrder(
            outletId: outletId,
            deliveryAddress: _addressCtrl.text.trim(),
            lines: ref.read(cartProvider.notifier).toOrderLines(),
            notes:
                _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
          );
      ref.read(cartProvider.notifier).clear();
      if (mounted) {
        context.go('/orders/${order.id}');
      }
    } catch (e) {
      setState(() {
        _submitting = false;
        _submitError = 'Order could not be submitted. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('New Order')),
        body: const ErrorView(message: 'No outlet linked to this account.'),
      );
    }

    final cart = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Order'),
        actions: [
          TextButton(
            onPressed: () => context.go('/catalog'),
            child: const Text('+ Add Items'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (cart.items.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                      child: Text('Cart is empty. Add items from catalog.')),
                ),
              )
            else ...[
              Text('Cart',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              ...cart.items.map((item) => _CartItemTile(item: item)),
              const Divider(),
              Align(
                alignment: Alignment.centerRight,
                child: Text('Total: ₹${cart.grandTotal}',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
              ),
            ],
            const SizedBox(height: 24),
            Text('Delivery Details',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _addressCtrl,
              decoration: const InputDecoration(
                labelText: 'Delivery Address *',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notesCtrl,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            if (_submitError != null) ...[
              const SizedBox(height: 12),
              Text(_submitError!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: (cart.items.isEmpty || _submitting) ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Place Order'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartItemTile extends ConsumerWidget {
  const _CartItemTile({required this.item});

  final CartItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(cartProvider.notifier);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.product.name,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(item.product.sku,
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 4),
                  _UnitPriceField(item: item),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () =>
                      notifier.updateQty(item.product.id, item.qty - 1),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('${item.qty}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 16)),
                ),
                IconButton(
                  icon: const Icon(Icons.add_circle_outline),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () =>
                      notifier.updateQty(item.product.id, item.qty + 1),
                ),
              ],
            ),
            const SizedBox(width: 8),
            Text('₹${item.lineTotal}',
                style: const TextStyle(fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

class _UnitPriceField extends ConsumerStatefulWidget {
  const _UnitPriceField({required this.item});

  final CartItem item;

  @override
  ConsumerState<_UnitPriceField> createState() => _UnitPriceFieldState();
}

class _UnitPriceFieldState extends ConsumerState<_UnitPriceField> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.item.unitPrice);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 120,
      child: TextFormField(
        controller: _ctrl,
        decoration: const InputDecoration(
          labelText: 'Unit Price',
          prefixText: '₹',
          isDense: true,
          border: OutlineInputBorder(),
        ),
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        onChanged: (v) {
          widget.item.unitPrice = v;
          ref
              .read(cartProvider.notifier)
              .updateQty(widget.item.product.id, widget.item.qty);
        },
        validator: (v) =>
            (v == null || double.tryParse(v) == null) ? 'Invalid' : null,
      ),
    );
  }
}
