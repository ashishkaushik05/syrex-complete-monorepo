import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/premium_surfaces.dart';

final _dispatchProvider = FutureProvider.autoDispose.family<SalesDispatchDetail, String>((ref, dispatchId) {
  return ref.watch(salesClientProvider).dispatchDetail(dispatchId);
});

class DispatchDetailPage extends ConsumerWidget {
  const DispatchDetailPage({super.key, required this.dispatchId});

  final String dispatchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(_dispatchProvider(dispatchId));

    return Scaffold(
      appBar: AppBar(title: const Text('Dispatch Detail')),
      body: PremiumGradientBackground(
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => const EmptyStateView(
            title: 'Dispatch not available',
            subtitle: 'Verify dispatch id and permissions.',
            icon: Icons.local_shipping_outlined,
          ),
          data: (dispatch) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(dispatch.id, style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Text('Transporter: ${dispatch.transporterName}'),
                    Text('Vehicle: ${dispatch.vehicleNumber}'),
                    Text('Status: ${dispatch.deliveryStatus}'),
                  ],
                ),
              ),
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Dispatched Lines', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    ...dispatch.lines.map(
                      (line) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(line.sku, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('Qty: ${line.qtyDispatched}'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
