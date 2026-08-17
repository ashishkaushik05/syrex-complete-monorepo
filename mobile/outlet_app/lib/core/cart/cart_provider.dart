import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/catalog.dart';
import '../utils/formatters.dart';

class CartItem {
  final ProductDto product;
  final int qty;
  const CartItem({required this.product, required this.qty});
}

class CartNotifier extends Notifier<Map<String, CartItem>> {
  @override
  Map<String, CartItem> build() => {};

  void setQty(ProductDto product, int qty) {
    final next = Map<String, CartItem>.from(state);
    if (qty <= 0) {
      next.remove(product.id);
    } else {
      next[product.id] = CartItem(product: product, qty: qty);
    }
    state = next;
  }

  void clear() => state = {};
}

final cartProvider = NotifierProvider<CartNotifier, Map<String, CartItem>>(
  CartNotifier.new,
);

// ── Derived helpers (pure functions, not providers) ────────────

int cartTotalQty(Map<String, CartItem> cart) =>
    cart.values.fold(0, (s, e) => s + e.qty);

double cartSubtotal(Map<String, CartItem> cart) => cart.values
    .fold(0.0, (s, e) => s + parseAmount(e.product.basePrice) * e.qty);

// Groups tax by GST rate. Assumes intra-state (CGST = SGST = rate/2).
List<({double rate, double cgst, double sgst})> cartTaxBreakdown(
    Map<String, CartItem> cart) {
  final byRate = <double, double>{};
  for (final item in cart.values) {
    final rate = parseAmount(item.product.gstRate);
    if (rate <= 0) continue;
    final taxable = parseAmount(item.product.basePrice) * item.qty;
    byRate[rate] = (byRate[rate] ?? 0) + taxable * rate / 100;
  }
  return byRate.entries
      .map((e) => (rate: e.key, cgst: e.value / 2, sgst: e.value / 2))
      .toList()
    ..sort((a, b) => a.rate.compareTo(b.rate));
}

double cartTotalGst(Map<String, CartItem> cart) =>
    cartTaxBreakdown(cart).fold(0.0, (s, e) => s + e.cgst + e.sgst);

double cartGrandTotal(Map<String, CartItem> cart) =>
    cartSubtotal(cart) + cartTotalGst(cart);
