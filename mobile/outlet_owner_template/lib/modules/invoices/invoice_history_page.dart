import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';
import 'invoice_history_screen.dart';

final _invoiceListProvider =
    FutureProvider.autoDispose<List<InvoiceListItem>>((ref) async {
  final outletId = ref.watch(outletIdProvider) ?? '';
  if (outletId.isEmpty) throw Exception('No outlet ID found');

  return ref
      .watch(outletPortalClientProvider)
      .invoiceHistory(outletId)
      .then((result) => result.items);
});

class InvoiceHistoryPage extends ConsumerWidget {
  final void Function(String route)? onNav;

  const InvoiceHistoryPage({
    super.key,
    this.onNav,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_invoiceListProvider);

    return Scaffold(
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load invoices.',
          onRetry: () => ref.refresh(_invoiceListProvider.future),
        ),
        data: (_) => InvoiceHistoryScreen(
          onNav: onNav,
        ),
      ),
    );
  }
}
