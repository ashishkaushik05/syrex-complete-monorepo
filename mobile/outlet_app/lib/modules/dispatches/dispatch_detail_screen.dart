import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/api/dispatches_client.dart';
import '../../core/models/dispatch.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/status_badge.dart';
import '../../shared/widgets/kv_row.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_button.dart';
import '../../app/theme_provider.dart';

final _dispatchDetailProvider =
    FutureProvider.autoDispose.family<DispatchDetailDto, ({String outletId, String dispatchId})>(
  (ref, args) =>
      ref.read(outletPortalClientProvider).dispatchDetail(args.outletId, args.dispatchId),
);

class DispatchDetailScreen extends ConsumerWidget {
  final String dispatchId;
  const DispatchDetailScreen({super.key, required this.dispatchId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final outletId = ref.watch(sessionControllerProvider).outletId;
    final args = (outletId: outletId, dispatchId: dispatchId);
    final detailAsync = ref.watch(_dispatchDetailProvider(args));

    return Scaffold(
      backgroundColor: c.bg,
      body: detailAsync.when(
        data: (d) => _Body(dispatch: d, c: c, ref: ref, args: args),
        loading: () => _Loading(c: c),
        error: (_, __) => Center(child: Text('Failed to load dispatch', style: TextStyle(color: c.textMute))),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final DispatchDetailDto dispatch;
  final AppThemeColors c;
  final WidgetRef ref;
  final ({String outletId, String dispatchId}) args;

  const _Body({required this.dispatch, required this.c, required this.ref, required this.args});

  bool get _isDelivered => dispatch.deliveryStatus == 'delivered';
  bool get _canConfirm => dispatch.deliveryStatus == 'in_transit';

  void _refresh() => ref.invalidate(_dispatchDetailProvider(args));

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: c.accent,
      onRefresh: () async => _refresh(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: OutletAppBar(
              title: '#${dispatch.id.substring(0, 8)}',
              subtitle: 'DISPATCH',
              c: c,
              showBack: true,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  StatusBadge(status: dispatch.deliveryStatus, c: c),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: _refresh,
                    child: Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: c.line),
                      ),
                      child: Icon(Icons.refresh_rounded, size: 18, color: c.textMute),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                if (_isDelivered) ...[
                  _DeliveredBanner(deliveredAt: dispatch.deliveredAt, c: c),
                  const SizedBox(height: 16),
                ],
                AppCard(
                  c: c,
                  child: Column(
                    children: [
                      KVRow(label: 'Dispatch date', value: fmtDateStr(dispatch.dispatchDate), c: c),
                      KVRow(label: 'Transporter', value: dispatch.transporterName, c: c),
                      KVRow(label: 'Vehicle no.', value: dispatch.vehicleNumber, c: c),
                      if (dispatch.lrNumber != null)
                        KVRow(label: 'LR number', value: dispatch.lrNumber!, c: c),
                      if (dispatch.estimatedDelivery != null)
                        KVRow(label: 'ETA', value: fmtDateStr(dispatch.estimatedDelivery), c: c),
                      if (dispatch.deliveredAt != null)
                        KVRow(
                          label: 'Delivered at',
                          value: fmtDateStr(dispatch.deliveredAt),
                          c: c,
                          last: true,
                          valueColor: c.greenText,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text('Items', style: AppTextStyles.sectionTitle(color: c.text)),
                const SizedBox(height: 10),
                ...dispatch.lines.map((line) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    c: c,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(line.sku, style: AppTextStyles.bodyHeavy(color: c.text)),
                        const SizedBox(height: 8),
                        KVRow(label: 'Ordered', value: '${line.qtyOrdered}', c: c),
                        KVRow(label: 'Dispatched', value: '${line.qtyDispatched}', c: c,
                            last: line.serialNumbers.isEmpty),
                        if (line.serialNumbers.isNotEmpty)
                          KVRow(
                            label: 'Serials',
                            value: line.serialNumbers.join(', '),
                            c: c,
                            last: true,
                          ),
                      ],
                    ),
                  ),
                )),
                if (_canConfirm) ...[
                  const SizedBox(height: 24),
                  AppButton(
                    label: 'Confirm delivery received',
                    c: c,
                    fullWidth: true,
                    onTap: () => _confirmDelivery(context),
                  ),
                ],
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDelivery(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirm delivery?'),
        content: const Text('Mark this shipment as delivered.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              await ref.read(dispatchesClientProvider).markDelivered(dispatch.id);
              _refresh();
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }
}

class _DeliveredBanner extends StatelessWidget {
  final String? deliveredAt;
  final AppThemeColors c;
  const _DeliveredBanner({required this.deliveredAt, required this.c});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      decoration: BoxDecoration(
        color: c.greenSoft,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.accentBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: c.accent,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded, color: Colors.white, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Delivery confirmed', style: AppTextStyles.bodyHeavy(color: c.greenText)),
                if (deliveredAt != null)
                  Text(
                    fmtDateStr(deliveredAt),
                    style: AppTextStyles.smallLabel(color: c.greenText).copyWith(
                      fontWeight: FontWeight.w400,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  final AppThemeColors c;
  const _Loading({required this.c});

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(18),
        children: List.generate(
          4,
          (_) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(height: 60, decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(16))),
          ),
        ),
      );
}
