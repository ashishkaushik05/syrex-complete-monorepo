import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/catalog_client.dart';
import '../../core/api/sales_client.dart';
import '../../shared/widgets/rb_components.dart';
import 'cart_provider.dart';

// ─── Providers ─────────────────────────────────────────────────────────────────

final _createOrderOutletsProvider =
    FutureProvider.autoDispose<List<SalesOutlet>>((ref) {
  return ref.watch(salesClientProvider).outlets();
});

final _createOrderProductsProvider =
    FutureProvider.autoDispose<PagedResult<Product>>((ref) {
  return ref.watch(catalogClientProvider).products(limit: 100);
});

// ─── Page ──────────────────────────────────────────────────────────────────────

class CreateOrderPage extends ConsumerStatefulWidget {
  const CreateOrderPage({super.key});

  @override
  ConsumerState<CreateOrderPage> createState() => _CreateOrderPageState();
}

class _CreateOrderPageState extends ConsumerState<CreateOrderPage> {
  int _step = 0; // 0 = pick products, 1 = review
  final _searchCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String? _outletId;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _searchCtrl.dispose();
    _addressCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final cart = ref.read(cartProvider);
    if (cart.items.isEmpty || _outletId == null) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final lines = ref.read(cartProvider.notifier).toOrderLines();
      final order = await ref.read(salesClientProvider).createOrder(
            outletId: _outletId!,
            deliveryAddress: _addressCtrl.text.trim(),
            lines: lines,
            notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
          );
      ref.read(cartProvider.notifier).clear();
      if (mounted) {
        RbToast.show(context, 'Order ${order.orderNumber} placed!');
        context.go('/orders/${order.id}');
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final cart = ref.watch(cartProvider);
    final outletAsync = ref.watch(_createOrderOutletsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          RbTopBar(
            title: _step == 0 ? 'New order' : 'Review order',
            leading: IconButton(
              icon: Icon(Icons.arrow_back, size: 20, color: c.ink),
              onPressed: () {
                if (_step == 1) {
                  setState(() => _step = 0);
                } else {
                  context.pop();
                }
              },
            ),
          ),
          // Step indicator
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _StepDot(active: _step == 0, done: _step > 0, label: '1'),
                Expanded(child: Divider(color: c.line, thickness: 0.5)),
                _StepDot(active: _step == 1, done: false, label: '2'),
              ],
            ),
          ),
          Expanded(
            child: _step == 0
                ? _Step1(
                    searchCtrl: _searchCtrl,
                    onNext: cart.items.isNotEmpty
                        ? () => setState(() => _step = 1)
                        : null,
                  )
                : _Step2(
                    cart: cart,
                    outletAsync: outletAsync,
                    selectedOutletId: _outletId,
                    addressCtrl: _addressCtrl,
                    notesCtrl: _notesCtrl,
                    error: _error,
                    submitting: _submitting,
                    onOutletSelected: (id) => setState(() => _outletId = id),
                    onSubmit: _outletId != null && !_submitting ? _submit : null,
                  ),
          ),
        ],
      ),
    );
  }
}

// ─── Step 1 — pick products ────────────────────────────────────────────────────

class _Step1 extends ConsumerWidget {
  const _Step1({required this.searchCtrl, required this.onNext});
  final TextEditingController searchCtrl;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = searchCtrl.text.toLowerCase();
    final productsAsync = ref.watch(_createOrderProductsProvider);
    final cart = ref.watch(cartProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: RbSearchInput(
            controller: searchCtrl,
            placeholder: 'Search products',
            onChanged: (_) => (context as Element).markNeedsBuild(),
          ),
        ),
        Expanded(
          child: productsAsync.when(
            loading: () => const Center(
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: RbColors.accent)),
            error: (e, _) => RbEmpty(
                icon: Icons.error_outline, title: 'Failed to load products'),
            data: (result) {
              final items = q.isEmpty
                  ? result.items
                  : result.items
                      .where((p) =>
                          p.name.toLowerCase().contains(q) ||
                          p.sku.toLowerCase().contains(q))
                      .toList();
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (ctx, i) => _PickProductRow(product: items[i]),
              );
            },
          ),
        ),
        if (cart.items.isNotEmpty)
          _StickyBar(
            label: 'Review order · ${cart.items.length} item${cart.items.length == 1 ? '' : 's'}',
            onTap: onNext,
            enabled: onNext != null,
          ),
      ],
    );
  }
}

class _PickProductRow extends ConsumerWidget {
  const _PickProductRow({required this.product});
  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final cartItem =
        cart.items.where((i) => i.product.id == product.id).firstOrNull;
    final c = rbColors(context);

    return RbCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            ProductTile(brandId: product.brandId ?? '', size: 40),
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
                  Text(fmtMoney(product.basePriceNum),
                      style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: c.muted)),
                ],
              ),
            ),
            cartItem != null
                ? RbQtyStepper(
                    qty: cartItem.qty,
                    size: RbQtySize.sm,
                    onDecrement: () {
                      if (cartItem.qty <= 1) {
                        ref
                            .read(cartProvider.notifier)
                            .removeProduct(product.id);
                      } else {
                        ref
                            .read(cartProvider.notifier)
                            .updateQty(product.id, cartItem.qty - 1);
                      }
                    },
                    onIncrement: () => ref
                        .read(cartProvider.notifier)
                        .updateQty(product.id, cartItem.qty + 1),
                  )
                : RbBtn(
                    label: 'Add',
                    variant: RbBtnVariant.accent,
                    size: RbBtnSize.sm,
                    onPressed: () => ref
                        .read(cartProvider.notifier)
                        .addProduct(product, product.basePrice ?? '0'),
                  ),
          ],
        ),
      ),
    );
  }
}

// ─── Step 2 — review ──────────────────────────────────────────────────────────

class _Step2 extends StatelessWidget {
  const _Step2({
    required this.cart,
    required this.outletAsync,
    required this.selectedOutletId,
    required this.addressCtrl,
    required this.notesCtrl,
    required this.error,
    required this.submitting,
    required this.onOutletSelected,
    required this.onSubmit,
  });
  final CartState cart;
  final AsyncValue<List<SalesOutlet>> outletAsync;
  final String? selectedOutletId;
  final TextEditingController addressCtrl;
  final TextEditingController notesCtrl;
  final String? error;
  final bool submitting;
  final ValueChanged<String> onOutletSelected;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final subtotal = cart.items
        .fold<double>(0, (s, i) => s + (double.tryParse(i.lineTotal) ?? 0));
    final discount = subtotal * 0.05;
    final tax = (subtotal - discount) * 0.18;
    final total = subtotal - discount + tax;

    return Stack(
      children: [
        SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Line items
              RbSection(label: 'Items'),
              const SizedBox(height: 8),
              RbCard(
                child: Column(
                  children: [
                    for (int i = 0; i < cart.items.length; i++)
                      _ReviewLine(item: cart.items[i], isFirst: i == 0),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Outlet
              RbSection(label: 'Outlet'),
              const SizedBox(height: 8),
              outletAsync.when(
                loading: () => const LinearProgressIndicator(minHeight: 2),
                error: (_, __) => Text('Failed to load outlets',
                    style: GoogleFonts.inter(color: c.muted)),
                data: (outlets) => RbCard(
                  child: Column(
                    children: [
                      for (int i = 0; i < outlets.length; i++)
                        RbRow(
                          isFirst: i == 0,
                          onTap: () => onOutletSelected(outlets[i].id),
                          child: Row(
                            children: [
                              Expanded(
                                  child: Text(outlets[i].name,
                                      style: GoogleFonts.inter(
                                          fontSize: 14, color: c.ink))),
                              if (selectedOutletId == outlets[i].id)
                                Icon(Icons.check,
                                    size: 16, color: RbColors.accent),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Delivery address
              RbSection(label: 'Delivery address'),
              const SizedBox(height: 8),
              TextField(
                controller: addressCtrl,
                maxLines: 2,
                style: GoogleFonts.inter(fontSize: 14, color: c.ink),
                decoration: InputDecoration(
                  hintText: 'Enter delivery address',
                  hintStyle: GoogleFonts.inter(color: c.muted2),
                ),
              ),
              const SizedBox(height: 16),

              // Notes
              RbSection(label: 'Notes (optional)'),
              const SizedBox(height: 8),
              TextField(
                controller: notesCtrl,
                maxLines: 3,
                style: GoogleFonts.inter(fontSize: 14, color: c.ink),
                decoration: InputDecoration(
                  hintText: 'Add any special instructions',
                  hintStyle: GoogleFonts.inter(color: c.muted2),
                ),
              ),
              const SizedBox(height: 16),

              // Totals
              RbSection(label: 'Order total'),
              const SizedBox(height: 8),
              RbCard(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: [
                      RbKvRow(k: 'Subtotal', v: fmtMoney(subtotal)),
                      RbKvRow(k: 'Discount (5%)', v: '−${fmtMoney(discount)}'),
                      RbKvRow(k: 'GST (18%)', v: fmtMoney(tax)),
                      const Divider(height: 16, thickness: 0.5),
                      RbKvRow(
                        k: 'Total',
                        v: fmtMoney(total),
                        bold: true,
                      ),
                    ],
                  ),
                ),
              ),

              if (error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: RbColors.dangerSoft,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(error!,
                      style: GoogleFonts.inter(
                          fontSize: 13, color: RbColors.danger)),
                ),
              ],
            ],
          ),
        ),
        _StickyBar(
          label: 'Submit order · ${fmtMoney(total)}',
          onTap: onSubmit,
          enabled: onSubmit != null,
          loading: submitting,
        ),
      ],
    );
  }
}

class _ReviewLine extends ConsumerWidget {
  const _ReviewLine({required this.item, required this.isFirst});
  final CartItem item;
  final bool isFirst;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.product.name,
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: c.ink)),
                Text(fmtMoney(double.tryParse(item.unitPrice) ?? 0),
                    style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
              ],
            ),
          ),
          RbQtyStepper(
            qty: item.qty,
            size: RbQtySize.sm,
            onDecrement: () {
              if (item.qty <= 1) {
                ref
                    .read(cartProvider.notifier)
                    .removeProduct(item.product.id);
              } else {
                ref
                    .read(cartProvider.notifier)
                    .updateQty(item.product.id, item.qty - 1);
              }
            },
            onIncrement: () => ref
                .read(cartProvider.notifier)
                .updateQty(item.product.id, item.qty + 1),
          ),
          const SizedBox(width: 10),
          Text(fmtMoney(double.tryParse(item.lineTotal) ?? 0),
              style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: c.ink)),
        ],
      ),
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

class _StickyBar extends StatelessWidget {
  const _StickyBar(
      {required this.label,
      required this.onTap,
      required this.enabled,
      this.loading = false});
  final String label;
  final VoidCallback? onTap;
  final bool enabled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Align(
      alignment: Alignment.bottomCenter,
      child: Container(
        decoration: BoxDecoration(
          color: c.surface,
          border:
              Border(top: BorderSide(color: c.line, width: 0.5)),
        ),
        padding: EdgeInsets.fromLTRB(
            16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: RbBtn(
          label: label,
          variant: RbBtnVariant.accent,
          size: RbBtnSize.lg,
          loading: loading,
          onPressed: enabled ? onTap : null,
        ),
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot(
      {required this.active, required this.done, required this.label});
  final bool active;
  final bool done;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active
            ? RbColors.ink
            : done
                ? RbColors.accent
                : rbColors(context).surface2,
        border: Border.all(
            color: active
                ? RbColors.ink
                : done
                    ? RbColors.accent
                    : rbColors(context).line,
            width: 1),
      ),
      alignment: Alignment.center,
      child: done
          ? const Icon(Icons.check, size: 12, color: Colors.white)
          : Text(label,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: active ? Colors.white : rbColors(context).muted,
              )),
    );
  }
}
