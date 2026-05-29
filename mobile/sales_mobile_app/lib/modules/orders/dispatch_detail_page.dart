import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/sales_client.dart';
import '../../shared/widgets/rb_components.dart';

final _dispatchDetailProvider =
    FutureProvider.autoDispose.family<SalesDispatchDetail, String>((ref, id) {
  return ref.watch(salesClientProvider).dispatchDetail(id);
});

class DispatchDetailPage extends ConsumerWidget {
  const DispatchDetailPage({super.key, required this.dispatchId});
  final String dispatchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_dispatchDetailProvider(dispatchId));
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                strokeWidth: 2, color: RbColors.accent)),
        error: (e, _) => Center(
            child: RbEmpty(
                icon: Icons.local_shipping_outlined,
                title: 'Dispatch not found',
                sub: e.toString())),
        data: (dispatch) => _DispatchBody(dispatch: dispatch),
      ),
    );
  }
}

class _DispatchBody extends StatelessWidget {
  const _DispatchBody({required this.dispatch});
  final SalesDispatchDetail dispatch;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final statusTone = _statusTone(dispatch.deliveryStatus);

    return Stack(
      children: [
        CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              backgroundColor: c.surface,
              leading: IconButton(
                icon: Icon(Icons.arrow_back, color: c.ink),
                onPressed: () => context.pop(),
              ),
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(dispatch.dispatchCode ?? dispatch.id.substring(0, 8),
                      style: GoogleFonts.jetBrainsMono(
                          fontSize: 14, color: c.ink)),
                  if (dispatch.orderCode != null)
                    Text(dispatch.orderCode!,
                        style: GoogleFonts.inter(
                            fontSize: 11, color: c.muted)),
                ],
              ),
              actions: [
                if (dispatch.driverPhone != null)
                  IconButton(
                    icon: Icon(Icons.phone_outlined, color: c.muted),
                    onPressed: () => _callDriver(dispatch.driverPhone!),
                  ),
              ],
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Status hero card
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.local_shipping_outlined,
                                  size: 28, color: RbColors.accent),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _statusLabel(dispatch.deliveryStatus),
                                      style: GoogleFonts.inter(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                          color: c.ink),
                                    ),
                                    if (dispatch.estimatedDelivery != null)
                                      Text(
                                          'ETA: ${_fmtDate(dispatch.estimatedDelivery!)}',
                                          style: GoogleFonts.inter(
                                              fontSize: 12, color: c.muted)),
                                  ],
                                ),
                              ),
                              RbChip(
                                  label: _statusLabel(dispatch.deliveryStatus),
                                  tone: statusTone),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Timeline
                  if (dispatch.timeline.isNotEmpty) ...[
                    RbSection(label: 'Tracking'),
                    const SizedBox(height: 8),
                    RbCard(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          children: [
                            for (int i = 0;
                                i < dispatch.timeline.length;
                                i++)
                              _TimelineRow(
                                step: dispatch.timeline[i],
                                isLast: i == dispatch.timeline.length - 1,
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Logistics
                  RbSection(label: 'Logistics'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        children: [
                          RbKvRow(
                              k: 'Transporter',
                              v: dispatch.transporterName),
                          RbKvRow(
                              k: 'Vehicle', v: dispatch.vehicleNumber),
                          if (dispatch.awb != null)
                            RbKvRow(k: 'AWB / LR', v: dispatch.awb!),
                          if (dispatch.driverPhone != null)
                            RbKvRow(
                                k: 'Driver phone',
                                v: dispatch.driverPhone!),
                          RbKvRow(
                              k: 'Dispatch date',
                              v: _fmtDate(dispatch.dispatchDate)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Items
                  RbSection(
                      label: 'Items (${dispatch.totalUnits} units)'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Column(
                      children: [
                        for (int i = 0; i < dispatch.lines.length; i++)
                          _DispatchLineRow(
                              line: dispatch.lines[i], isFirst: i == 0),
                      ],
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ),

        // Sticky bottom
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Container(
            decoration: BoxDecoration(
              color: c.surface,
              border:
                  Border(top: BorderSide(color: c.line, width: 0.5)),
            ),
            padding: EdgeInsets.fromLTRB(
                16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
            child: Row(
              children: [
                if (dispatch.driverPhone != null)
                  Expanded(
                    child: RbBtn(
                      label: 'Call driver',
                      variant: RbBtnVariant.outline,
                      size: RbBtnSize.lg,
                      onPressed: () =>
                          _callDriver(dispatch.driverPhone!),
                    ),
                  ),
                if (dispatch.driverPhone != null)
                  const SizedBox(width: 10),
                Expanded(
                  child: RbBtn(
                    label: 'Track on map',
                    variant: RbBtnVariant.accent,
                    size: RbBtnSize.lg,
                    onPressed: () {},
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static String _fmtDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[dt.month - 1]} ${dt.day}, ${dt.year}';
  }

  static String _statusLabel(String s) {
    return s.replaceAll('_', ' ').split(' ').map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
  }

  static RbTone _statusTone(String s) {
    switch (s) {
      case 'delivered': return RbTone.success;
      case 'in_transit': return RbTone.info;
      case 'out_for_delivery': return RbTone.accent;
      case 'returned': return RbTone.danger;
      default: return RbTone.neutral;
    }
  }

  static Future<void> _callDriver(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.step, required this.isLast});
  final DispatchTimelineStep step;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final color = step.done
        ? RbColors.accent
        : step.current
            ? RbColors.ink
            : c.line2;

    return IntrinsicHeight(
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color,
                    border: Border.all(color: color, width: 1.5),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      color: step.done ? RbColors.accent : c.line,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(step.label,
                      style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight:
                              step.current ? FontWeight.w600 : FontWeight.w400,
                          color: step.done || step.current ? c.ink : c.muted)),
                  if (step.time.isNotEmpty && step.time != '—')
                    Text(step.time,
                        style: GoogleFonts.inter(
                            fontSize: 12, color: c.muted)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DispatchLineRow extends StatelessWidget {
  const _DispatchLineRow({required this.line, required this.isFirst});
  final SalesDispatchLine line;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(line.productName ?? line.sku,
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: c.ink)),
              ),
              RbChip(label: '${line.qtyDispatched} units', tone: RbTone.neutral),
            ],
          ),
          if (line.serialNumbers.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: line.serialNumbers
                  .map((sn) => RbChip(label: sn, tone: RbTone.neutral))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}
