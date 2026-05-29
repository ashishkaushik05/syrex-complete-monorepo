import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/sales_client.dart';
import '../../shared/widgets/rb_components.dart';

// ─── Providers ─────────────────────────────────────────────────────────────────

class _InvoiceFilter {
  const _InvoiceFilter({this.status, this.q});
  final String? status;
  final String? q;
  @override
  bool operator ==(Object o) =>
      o is _InvoiceFilter && o.status == status && o.q == q;
  @override
  int get hashCode => Object.hash(status, q);
}

final _invoiceFilterProvider =
    StateProvider.autoDispose<_InvoiceFilter>((_) => const _InvoiceFilter());

final _invoicesProvider = FutureProvider.autoDispose
    .family<PagedResult<SalesInvoice>, _InvoiceFilter>((ref, f) {
  return ref.watch(salesClientProvider).invoices(status: f.status, q: f.q, limit: 50);
});

// ─── Page ──────────────────────────────────────────────────────────────────────

const _invFilterLabels = {
  null: 'All',
  'overdue': 'Overdue',
  'partial': 'Partial',
  'open': 'Open',
  'paid': 'Paid',
};

class InvoiceHistoryPage extends ConsumerStatefulWidget {
  const InvoiceHistoryPage({super.key});

  @override
  ConsumerState<InvoiceHistoryPage> createState() =>
      _InvoiceHistoryPageState();
}

class _InvoiceHistoryPageState extends ConsumerState<InvoiceHistoryPage> {
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(_invoiceFilterProvider);
    final async = ref.watch(_invoicesProvider(filter));
    final c = rbColors(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          RbTopBar(
            title: 'Invoices',
            actions: [
              RbIconBtn(
                  icon: Icons.filter_list_outlined, onTap: () {}),
            ],
          ),

          // Dark hero summary card
          async.maybeWhen(
            data: (result) {
              final totalDue = result.items
                  .fold<double>(0, (s, i) => s + i.amountDueNum);
              final overdue =
                  result.items.where((i) => i.status == 'overdue').length;
              return _HeroCard(
                  totalDue: totalDue, overdueCount: overdue, isDark: isDark);
            },
            orElse: () => const SizedBox.shrink(),
          ),

          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: RbSearchInput(
              controller: _searchCtrl,
              placeholder: 'Search invoices',
              onChanged: (v) => ref.read(_invoiceFilterProvider.notifier).update(
                    (s) =>
                        _InvoiceFilter(status: s.status, q: v.isEmpty ? null : v),
                  ),
            ),
          ),
          const SizedBox(height: 8),

          // Filter chips
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: _invFilterLabels.entries
                  .map((e) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: _FilterPill(
                          label: e.value,
                          selected: filter.status == e.key,
                          onTap: () => ref
                              .read(_invoiceFilterProvider.notifier)
                              .update((s) =>
                                  _InvoiceFilter(status: e.key, q: s.q)),
                        ),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: 8),

          Expanded(
            child: async.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: RbColors.accent)),
              error: (e, _) => RbEmpty(
                  icon: Icons.receipt_long_outlined,
                  title: 'Could not load invoices',
                  sub: e.toString()),
              data: (result) {
                if (result.items.isEmpty) {
                  return const RbEmpty(
                    icon: Icons.receipt_long_outlined,
                    title: 'No invoices found',
                    sub: 'Try adjusting the filters.',
                  );
                }
                return RefreshIndicator(
                  color: RbColors.accent,
                  onRefresh: () async =>
                      ref.invalidate(_invoicesProvider(filter)),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                    itemCount: result.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (ctx, i) =>
                        _InvoiceCard(invoice: result.items[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Hero card ─────────────────────────────────────────────────────────────────

class _HeroCard extends StatelessWidget {
  const _HeroCard(
      {required this.totalDue, required this.overdueCount, required this.isDark});
  final double totalDue;
  final int overdueCount;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? RbColorsDark.surface2 : RbColors.ink,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Total amount due',
              style: GoogleFonts.inter(
                  fontSize: 13,
                  color: Colors.white.withOpacity(0.6))),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(fmtMoney(totalDue),
                  style: GoogleFonts.inter(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  )),
              const Spacer(),
              if (overdueCount > 0)
                RbChip(
                    label: '$overdueCount overdue',
                    tone: RbTone.danger),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: RbBtn(
              label: 'Pay outstanding',
              variant: RbBtnVariant.outline,
              size: RbBtnSize.sm,
              onPressed: () {},
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Invoice card ──────────────────────────────────────────────────────────────

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});
  final SalesInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbCard(
      onTap: () =>
          context.push('/finance/invoices/${invoice.id}'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(invoice.invoiceNumber,
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: c.ink)),
                const Spacer(),
                StatusChip.invoice(invoice.status),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Text(_fmtDate(invoice.invoiceDate),
                    style: GoogleFonts.inter(
                        fontSize: 12, color: c.muted)),
                if (invoice.dueDate != null) ...[
                  Text(' · Due ${_fmtDate(invoice.dueDate!)}',
                      style: GoogleFonts.inter(
                          fontSize: 12, color: c.muted)),
                ],
                const Spacer(),
                Text(fmtMoney(invoice.totalNum),
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: c.ink)),
              ],
            ),
            if (invoice.amountDueNum > 0) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('Due: ',
                      style: GoogleFonts.inter(
                          fontSize: 12, color: c.muted)),
                  Text(fmtMoney(invoice.amountDueNum),
                      style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: RbColors.danger)),
                  const Spacer(),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: invoice.paidPct,
                  minHeight: 4,
                  backgroundColor: RbColors.dangerSoft,
                  valueColor:
                      const AlwaysStoppedAnimation<Color>(RbColors.accent),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _fmtDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[dt.month - 1]} ${dt.day}';
  }
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

class _FilterPill extends StatelessWidget {
  const _FilterPill(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? c.ink : c.surface,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
              color: selected ? c.ink : c.line, width: 0.5),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: selected ? Colors.white : c.ink2,
          ),
        ),
      ),
    );
  }
}
