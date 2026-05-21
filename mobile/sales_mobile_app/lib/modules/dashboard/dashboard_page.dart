import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../core/auth/session_controller.dart';
import '../../modules/field/providers/field_providers.dart';
import '../../shared/widgets/premium_surfaces.dart';

class OutletSummaryRow {
  const OutletSummaryRow({
    required this.outlet,
    required this.openInvoices,
    required this.outstanding,
  });

  final SalesOutlet outlet;
  final int openInvoices;
  final double outstanding;
}

final _dashboardProvider = FutureProvider.autoDispose<List<OutletSummaryRow>>((ref) async {
  final client = ref.watch(salesClientProvider);
  final outlets = await client.outlets();
  final invoiceResult = await client.invoices();

  final invoiceCountByOutlet = <String, int>{};
  final outstandingByOutlet = <String, double>{};
  for (final invoice in invoiceResult.items) {
    final due = double.tryParse(invoice.amountDue) ?? 0;
    if (due <= 0) continue;
    invoiceCountByOutlet.update(invoice.outletId, (v) => v + 1, ifAbsent: () => 1);
    outstandingByOutlet.update(invoice.outletId, (v) => v + due, ifAbsent: () => due);
  }

  return outlets
      .map(
        (outlet) => OutletSummaryRow(
          outlet: outlet,
          openInvoices: invoiceCountByOutlet[outlet.id] ?? 0,
          outstanding: outstandingByOutlet[outlet.id] ?? 0,
        ),
      )
      .toList();
});

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user;
    final asyncRows = ref.watch(_dashboardProvider);
    final shiftAsync = ref.watch(activeShiftProvider);

    return PremiumGradientBackground(
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_dashboardProvider);
          ref.invalidate(activeShiftProvider);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
          children: [
            Text(
              'Home',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: AppPalette.ink,
                  ),
            ),
            const SizedBox(height: 4),
            Text('Welcome back, ${user?.email ?? ''}', style: const TextStyle(color: Color(0xFF60707F))),
            const SizedBox(height: 14),
            QuickActionRail(
              actions: [
                QuickActionItem(
                  label: 'Create Order',
                  icon: Icons.add_shopping_cart,
                  onTap: () => context.push('/orders/create'),
                ),
                QuickActionItem(
                  label: 'Log Visit',
                  icon: Icons.add_location_alt_rounded,
                  onTap: () => context.push('/field/visit'),
                ),
                QuickActionItem(
                  label: 'Start/End Stop',
                  icon: Icons.pause_circle_filled_rounded,
                  onTap: () => context.push('/field/stop'),
                ),
                QuickActionItem(
                  label: 'Mark Attendance',
                  icon: Icons.event_available_rounded,
                  onTap: () => context.push('/field/attendance'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            PremiumCard(
              child: shiftAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Shift status unavailable.'),
                data: (shift) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Shift Snapshot', style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text(
                          shift == null ? 'No active shift' : 'Active since ${_readableTime(shift.startedAt)}',
                          style: const TextStyle(color: Color(0xFF5E6E7B)),
                        ),
                      ],
                    ),
                    StateBadge(
                      label: shift == null ? 'OFF SHIFT' : 'ACTIVE',
                      color: shift == null ? AppPalette.amber : AppPalette.mint,
                    ),
                  ],
                ),
              ),
            ),
            PremiumCard(
              child: asyncRows.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Could not load daily summary.'),
                data: (rows) {
                  final totalDue = rows.fold<double>(0, (sum, row) => sum + row.outstanding);
                  final atRisk = rows.where((row) => row.openInvoices > 0).length;
                  return Row(
                    children: [
                      Expanded(child: _MetricTile(label: 'Outstanding', value: '₹${totalDue.toStringAsFixed(0)}')),
                      Expanded(child: _MetricTile(label: 'Pending Outlets', value: '$atRisk')),
                      Expanded(child: _MetricTile(label: 'Outlets', value: '${rows.length}')),
                    ],
                  );
                },
              ),
            ),
            const SizedBox(height: 2),
            const Text('Pending Tasks', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 10),
            asyncRows.when(
              loading: () => const PremiumCard(child: LinearProgressIndicator()),
              error: (_, __) => const PremiumCard(child: Text('Unable to load tasks.')),
              data: (rows) {
                final dueRows = rows.where((row) => row.openInvoices > 0).toList();
                if (dueRows.isEmpty) {
                  return const PremiumCard(
                    child: EmptyStateView(
                      title: 'No pending financial tasks',
                      subtitle: 'All tracked outlets are clear for now.',
                      icon: Icons.done_all,
                    ),
                  );
                }
                return Column(
                  children: dueRows
                      .map(
                        (row) => PremiumCard(
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(row.outlet.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text('${row.openInvoices} invoices pending'),
                            trailing: Text('₹${row.outstanding.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  static String _readableTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return iso;
    final hour = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final minute = dt.minute.toString().padLeft(2, '0');
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    return '$hour:$minute $ampm';
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppPalette.ink)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF6A7885))),
      ],
    );
  }
}
