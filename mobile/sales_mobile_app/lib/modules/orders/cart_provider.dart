import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/catalog_client.dart';
import '../../core/api/sales_client.dart';

class CartItem {
  CartItem({
    required this.product,
    required this.qty,
    required this.unitPrice,
  });

  final Product product;
  int qty;
  String unitPrice;

  String get lineTotal {
    final price = double.tryParse(unitPrice) ?? 0;
    return (price * qty).toStringAsFixed(2);
  }
}

class CartState {
  const CartState({this.items = const [], this.deliveryAddress = '', this.notes});

  final List<CartItem> items;
  final String deliveryAddress;
  final String? notes;

  String get grandTotal {
    final total = items.fold<double>(
      0,
      (sum, item) => sum + (double.tryParse(item.lineTotal) ?? 0),
    );
    return total.toStringAsFixed(2);
  }

  CartState copyWith({
    List<CartItem>? items,
    String? deliveryAddress,
    String? notes,
  }) =>
      CartState(
        items: items ?? this.items,
        deliveryAddress: deliveryAddress ?? this.deliveryAddress,
        notes: notes ?? this.notes,
      );
}

class CartNotifier extends Notifier<CartState> {
  @override
  CartState build() => const CartState();

  void addProduct(Product product, String unitPrice) {
    final existing = state.items.indexWhere((i) => i.product.id == product.id);
    if (existing >= 0) {
      final updated = List<CartItem>.from(state.items);
      updated[existing].qty++;
      state = state.copyWith(items: updated);
    } else {
      state = state.copyWith(
        items: [...state.items, CartItem(product: product, qty: 1, unitPrice: unitPrice)],
      );
    }
  }

  void removeProduct(String productId) {
    state = state.copyWith(
      items: state.items.where((i) => i.product.id != productId).toList(),
    );
  }

  void updateQty(String productId, int qty) {
    if (qty <= 0) {
      removeProduct(productId);
      return;
    }
    final updated = List<CartItem>.from(state.items);
    final idx = updated.indexWhere((i) => i.product.id == productId);
    if (idx >= 0) updated[idx].qty = qty;
    state = state.copyWith(items: updated);
  }

  void updatePrice(String productId, String price) {
    final updated = List<CartItem>.from(state.items);
    final idx = updated.indexWhere((i) => i.product.id == productId);
    if (idx >= 0) updated[idx] = CartItem(product: updated[idx].product, qty: updated[idx].qty, unitPrice: price);
    state = state.copyWith(items: updated);
  }

  void setDeliveryAddress(String address) =>
      state = state.copyWith(deliveryAddress: address);

  void setNotes(String? notes) => state = state.copyWith(notes: notes);

  void clear() => state = const CartState();

  List<OrderLineInput> toOrderLines() => state.items
      .map((i) => OrderLineInput(
            productId: i.product.id,
            qtyOrdered: i.qty,
            unitPrice: i.unitPrice,
          ))
      .toList();
}

final cartProvider = NotifierProvider<CartNotifier, CartState>(CartNotifier.new);
