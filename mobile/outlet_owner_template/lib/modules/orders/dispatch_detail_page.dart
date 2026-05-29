import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/error_view.dart';
import '../../shared/widgets/status_chip.dart';

final _dispatchDetailProvider = FutureProvider.autoDispose
    .family<DispatchDetail, ({String outletId, String dispatchId})>(
        (ref, args) {
  return ref
      .watch(outletPortalClientProvider)
      .dispatchDetail(args.outletId, args.dispatchId);
});

class DispatchDetailPage extends ConsumerStatefulWidget {
  const DispatchDetailPage({super.key, required this.dispatchId});

  final String dispatchId;

  @override
  ConsumerState<DispatchDetailPage> createState() => _DispatchDetailPageState();
}

class _DispatchDetailPageState extends ConsumerState<DispatchDetailPage> {
  var _marking = false;

  Future<void> _openMarkDeliveredSheet(
    BuildContext context,
    DispatchDetail dispatch,
    String outletId,
  ) async {
    final noteCtrl = TextEditingController();
    var receivedAll = true;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setInnerState) => Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 8,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 18,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Confirm delivery',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Text(
                  'This closes the dispatch and marks items as received.',
                  style: Theme.of(ctx)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 14),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment<bool>(
                      value: true,
                      label: Text('Received in full'),
                    ),
                    ButtonSegment<bool>(
                      value: false,
                      label: Text('Partial receipt'),
                    ),
                  ],
                  selected: {receivedAll},
                  onSelectionChanged: (s) {
                    setInnerState(() => receivedAll = s.first);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: noteCtrl,
                  minLines: 2,
                  maxLines: 4,
                  decoration: InputDecoration(
                    labelText: 'Delivery note (optional)',
                    hintText: receivedAll
                        ? 'Receiver name / dock reference'
                        : 'Mention partial quantity or missing items',
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    icon: const Icon(Icons.check),
                    label: const Text('Mark as delivered'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (confirmed != true || !mounted) {
      noteCtrl.dispose();
      return;
    }

    setState(() => _marking = true);
    try {
      await ref.read(outletPortalClientProvider).markDispatchDelivered(
            widget.dispatchId,
            note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
            deliveredAt: DateTime.now(),
          );
      ref.invalidate(_dispatchDetailProvider(
          (outletId: outletId, dispatchId: widget.dispatchId)));
      if (mounted) {
        ScaffoldMessenger.of(this.context).showSnackBar(
          const SnackBar(content: Text('Dispatch marked as delivered.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(this.context).showSnackBar(
          const SnackBar(content: Text('Could not mark as delivered.')),
        );
      }
    } finally {
      noteCtrl.dispose();
      if (mounted) {
        setState(() => _marking = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return const Scaffold(
        body: Center(child: Text('No outlet linked to this account.')),
      );
    }

    final args = (outletId: outletId, dispatchId: widget.dispatchId);
    final async = ref.watch(_dispatchDetailProvider(args));

    return Scaffold(
      appBar: AppBar(title: const Text('Dispatch')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Could not load dispatch.',
          onRetry: () => ref.refresh(_dispatchDetailProvider(args).future),
        ),
        data: (dispatch) {
          final canMark = dispatch.deliveryStatus == 'created' ||
              dispatch.deliveryStatus == 'in_transit';
          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () =>
                    ref.refresh(_dispatchDetailProvider(args).future),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(16, 16, 16, canMark ? 120 : 24),
                  children: [
                    _HeaderCard(dispatch: dispatch),
                    const SizedBox(height: 16),
                    _LinesCard(lines: dispatch.lines),
                  ],
                ),
              ),
              if (canMark)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .scaffoldBackgroundColor
                          .withAlpha(245),
                      border:
                          Border(top: BorderSide(color: Colors.grey.shade300)),
                    ),
                    child: FilledButton.icon(
                      onPressed: _marking
                          ? null
                          : () => _openMarkDeliveredSheet(
                              context, dispatch, outletId),
                      icon: _marking
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.check_circle_outline),
                      label:
                          Text(_marking ? 'Submitting…' : 'Mark as delivered'),
                    ),
                  ),
                ),
            ],
          );
        },
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
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : dispatch.dispatchDate;
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

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: dispatch.deliveryStatus == 'delivered'
                        ? const Color(0xFFEAFBF3)
                        : const Color(0xFFEEF2FF),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    dispatch.deliveryStatus == 'delivered'
                        ? Icons.check
                        : Icons.local_shipping_outlined,
                    color: dispatch.deliveryStatus == 'delivered'
                        ? const Color(0xFF10B981)
                        : const Color(0xFF6366F1),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    dispatch.id.substring(0, 8).toUpperCase(),
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                StatusChip(status: dispatch.deliveryStatus),
              ],
            ),
            const SizedBox(height: 14),
            _Row('Date', dateStr),
            _Row('Transporter', dispatch.transporterName),
            _Row('Vehicle', dispatch.vehicleNumber),
            if (dispatch.lrNumber != null) _Row('LR No.', dispatch.lrNumber!),
            if (etaStr != null) _Row('ETA', etaStr),
            if (deliveredStr != null) _Row('Delivered', deliveredStr),
          ],
        ),
      ),
    );
  }
}

class _LinesCard extends StatelessWidget {
  const _LinesCard({required this.lines});
  final List<DispatchLineItem> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Items in this dispatch',
          style: Theme.of(context)
              .textTheme
              .titleSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: Text(
                        'SKU',
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ),
                    SizedBox(
                      width: 56,
                      child: Text(
                        'Ordered',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ),
                    SizedBox(
                      width: 64,
                      child: Text(
                        'Sent',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              ...lines.map((l) => _LineRow(line: l)),
            ],
          ),
        ),
      ],
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});
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
                child: Text(
                  '${line.qtyOrdered}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.black54),
                ),
              ),
              SizedBox(
                width: 64,
                child: Center(
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: isFull
                          ? const Color(0xFFEAFBF3)
                          : const Color(0xFFEEF2FF),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${line.qtyDispatched}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isFull
                            ? const Color(0xFF10B981)
                            : const Color(0xFF6366F1),
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
            padding: const EdgeInsets.only(left: 16, right: 16, bottom: 8),
            child: Wrap(
              spacing: 4,
              runSpacing: 4,
              children: line.serialNumbers
                  .map((sn) => Chip(
                        label: Text(sn, style: const TextStyle(fontSize: 11)),
                        padding: EdgeInsets.zero,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
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
            width: 94,
            child: Text(
              label,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.grey.shade600),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
