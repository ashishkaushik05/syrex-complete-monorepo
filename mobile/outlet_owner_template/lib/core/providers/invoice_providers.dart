import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/outlet_portal_client.dart';
import '../auth/session_controller.dart';

/// Provider for the list of invoices for the current user's outlet
final invoiceListProvider =
    FutureProvider.autoDispose<List<InvoiceListItem>>((ref) async {
  final session = ref.watch(sessionControllerProvider);
  final outletId = session.user?.outletId;

  if (outletId == null) {
    throw Exception('No outlet ID found in session');
  }

  final client = ref.watch(outletPortalClientProvider);
  final result = await client.invoiceHistory(outletId);
  return result.items;
});

/// Provider for invoice detail by ID
final invoiceDetailProvider = FutureProvider.autoDispose
    .family<InvoiceDetail, String>((ref, invoiceId) async {
  final session = ref.watch(sessionControllerProvider);
  final outletId = session.user?.outletId;

  if (outletId == null) {
    throw Exception('No outlet ID found in session');
  }

  final client = ref.watch(outletPortalClientProvider);
  return client.invoiceDetail(outletId, invoiceId);
});
