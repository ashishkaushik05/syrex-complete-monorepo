import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';

final _dispatchDetailProvider = FutureProvider.autoDispose
    .family<DispatchDetail, ({String outletId, String dispatchId})>(
        (ref, args) async {
  return ref
      .watch(outletPortalClientProvider)
      .dispatchDetail(args.outletId, args.dispatchId);
});

class DispatchDetailPage extends ConsumerWidget {
  const DispatchDetailPage(
      {super.key, required this.dispatchId, this.outletId});

  final String dispatchId;
  final String? outletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resolved = (outletId?.isNotEmpty == true ? outletId : null) ??
        ref.watch(outletIdProvider) ??
        '';
    final args = (outletId: resolved, dispatchId: dispatchId);
    final async = ref.watch(_dispatchDetailProvider(args));

    return Scaffold(
      appBar: AppBar(title: const Text('Dispatch')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load dispatch.',
          onRetry: () =>
              ref.refresh(_dispatchDetailProvider(args).future),
        ),
        data: (dispatch) => RefreshIndicator(
          onRefresh: () =>
              ref.refresh(_dispatchDetailProvider(args).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _HeaderCard(dispatch: dispatch),
              const SizedBox(height: 16),
              _BatteryFulfillmentTable(lines: dispatch.lines),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.dispatch});
  final DispatchDetail dispatch;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(dispatch.dispatchDate);
    final dateStr =
        date != null ? '${date.day}/${date.month}/${date.year}' : dispatch.dispatchDate;
    final eta = dispatch.estimatedDelivery != null
        ? DateTime.tryParse(dispatch.estimatedDelivery!)
        : null;
    final etaStr = eta != null ? '${eta.day}/${eta.month}/${eta.year}' : null;
    final delivered = dispatch.deliveredAt != null
        ? DateTime.tryParse(dispatch.deliveredAt!)
        : null;
    final deliveredStr = delivered != null
        ? '${delivered.day}/${delivered.month}/${delivered.year}'
        : null;

    final statusColor = switch (dispatch.deliveryStatus) {
      'delivered' => Colors.green,
      'in_transit' => Colors.blue,
      _ => Colors.orange,
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Dispatch Details',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    dispatch.deliveryStatus.toUpperCase().replaceAll('_', ' '),
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: statusColor),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _Row('Date', dateStr),
            _Row('Transporter', dispatch.transporterName),
            _Row('Vehicle', dispatch.vehicleNumber),
            if (dispatch.lrNumber != null)
              _Row('LR No.', dispatch.lrNumber!),
            if (etaStr != null) _Row('Est. Delivery', etaStr),
            if (deliveredStr != null) _Row('Delivered', deliveredStr),
          ],
        ),
      ),
    );
  }
}

class _BatteryFulfillmentTable extends StatelessWidget {
  const _BatteryFulfillmentTable({required this.lines});
  final List<DispatchLineItem> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Batteries in this Dispatch',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                        flex: 3,
                        child: Text('SKU',
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: Colors.grey))),
                    SizedBox(
                        width: 56,
                        child: Text('Ordered',
                            textAlign: TextAlign.center,
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: Colors.grey))),
                    SizedBox(
                        width: 64,
                        child: Text('Dispatched',
                            textAlign: TextAlign.center,
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: Colors.grey))),
                  ],
                ),
              ),
              const Divider(height: 1),
              ...lines.map((l) => _BatteryRow(line: l)),
            ],
          ),
        ),
      ],
    );
  }
}

class _BatteryRow extends StatelessWidget {
  const _BatteryRow({required this.line});
  final DispatchLineItem line;

  @override
  Widget build(BuildContext context) {
    final isFull = line.qtyDispatched >= line.qtyOrdered;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Expanded(
                flex: 3,
                child: Text(line.sku,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              SizedBox(
                  width: 56,
                  child: Text('${line.qtyOrdered}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.black54))),
              SizedBox(
                width: 64,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: isFull
                          ? Colors.green.shade100
                          : Colors.blue.shade100,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${line.qtyDispatched}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isFull
                            ? Colors.green.shade800
                            : Colors.blue.shade800,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (line.serialNumbers.isNotEmpty)
          Padding(
            padding:
                const EdgeInsets.only(left: 16, right: 16, bottom: 8),
            child: Wrap(
              spacing: 4,
              runSpacing: 4,
              children: line.serialNumbers
                  .map((sn) => Chip(
                        label: Text(sn,
                            style: const TextStyle(fontSize: 11)),
                        padding: EdgeInsets.zero,
                        materialTapTargetSize:
                            MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      ))
                  .toList(),
            ),
          ),
        const Divider(height: 1),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.grey)),
          ),
          Expanded(
              child: Text(value,
                  style: const TextStyle(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
