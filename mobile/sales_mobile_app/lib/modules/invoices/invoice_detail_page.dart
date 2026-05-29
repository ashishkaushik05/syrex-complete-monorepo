import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/sales_client.dart';
import '../../shared/widgets/rb_components.dart';

final _invoiceDetailProvider =
    FutureProvider.autoDispose.family<SalesInvoiceDetail, String>((ref, id) {
  return ref.watch(salesClientProvider).invoiceDetail(id);
});

class InvoiceDetailPage extends ConsumerWidget {
  const InvoiceDetailPage({super.key, required this.invoiceId});
  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_invoiceDetailProvider(invoiceId));
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(
                strokeWidth: 2, color: RbColors.accent)),
        error: (e, _) => Center(
            child: RbEmpty(
                icon: Icons.receipt_long_outlined,
                title: 'Invoice not found',
                sub: e.toString())),
        data: (inv) => _InvoiceBody(inv: inv),
      ),
    );
  }
}

class _InvoiceBody extends StatelessWidget {
  const _InvoiceBody({required this.inv});
  final SalesInvoiceDetail inv;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);

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
                  Text(inv.invoiceNumber,
                      style: GoogleFonts.jetBrainsMono(
                          fontSize: 14, color: c.ink)),
                  Text(_fmtDate(inv.invoiceDate),
                      style: GoogleFonts.inter(fontSize: 11, color: c.muted)),
                ],
              ),
              actions: [
                IconButton(
                  icon: Icon(Icons.description_outlined, color: c.muted),
                  onPressed: () {},
                ),
              ],
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Amount hero
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(fmtMoney(inv.totalNum),
                                        style: GoogleFonts.inter(
                                          fontSize: 28,
                                          fontWeight: FontWeight.w700,
                                          color: c.ink,
                                          fontFeatures: const [FontFeature.tabularFigures()],
                                        )),
                                    if (inv.amountDueNum > 0)
                                      Text('${fmtMoney(inv.amountDueNum)} due',
                                          style: GoogleFonts.inter(
                                              fontSize: 13,
                                              color: RbColors.danger)),
                                  ],
                                ),
                              ),
                              StatusChip.invoice(inv.status),
                            ],
                          ),
                          const SizedBox(height: 12),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                              value: inv.paidPct,
                              minHeight: 6,
                              backgroundColor:
                                  RbColors.dangerSoft,
                              valueColor:
                                  const AlwaysStoppedAnimation<Color>(
                                      RbColors.accent),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Text('Paid: ${fmtMoney(inv.amountPaidNum)}',
                                  style: GoogleFonts.inter(
                                      fontSize: 12, color: c.muted)),
                              const Spacer(),
                              Text(
                                  '${(inv.paidPct * 100).toStringAsFixed(0)}%',
                                  style: GoogleFonts.inter(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: c.ink2)),
                            ],
                          ),
                          if (inv.orderCode != null) ...[
                            const SizedBox(height: 10),
                            GestureDetector(
                              onTap: () {},
                              child: Text('From order ${inv.orderCode}',
                                  style: GoogleFonts.inter(
                                      fontSize: 13,
                                      color: RbColors.accent,
                                      decoration: TextDecoration.underline)),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Line items
                  RbSection(label: 'Items (${inv.lines.length})'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Column(
                      children: [
                        for (int i = 0; i < inv.lines.length; i++)
                          _InvLineRow(line: inv.lines[i], isFirst: i == 0),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Breakdown
                  RbSection(label: 'Breakdown'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        children: [
                          if (inv.subtotalNum > 0)
                            RbKvRow(k: 'Subtotal', v: fmtMoney(inv.subtotalNum)),
                          if (inv.discountNum > 0)
                            RbKvRow(k: 'Discount', v: '−${fmtMoney(inv.discountNum)}'),
                          ...inv.charges.map(
                              (ch) => RbKvRow(k: ch.k, v: fmtMoney(ch.v))),
                          const Divider(height: 16, thickness: 0.5),
                          RbKvRow(
                              k: 'Total', v: fmtMoney(inv.totalNum), bold: true),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Payment history
                  if (inv.payments.isNotEmpty) ...[
                    RbSection(label: 'Payment history'),
                    const SizedBox(height: 8),
                    RbCard(
                      child: Column(
                        children: [
                          for (int i = 0; i < inv.payments.length; i++)
                            RbRow(
                              isFirst: i == 0,
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(inv.payments[i].method,
                                            style: GoogleFonts.inter(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w500,
                                                color: c.ink)),
                                        Text(_fmtDate(inv.payments[i].date),
                                            style: GoogleFonts.inter(
                                                fontSize: 12, color: c.muted)),
                                      ],
                                    ),
                                  ),
                                  Text(fmtMoney(inv.payments[i].amount),
                                      style: GoogleFonts.inter(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: RbColors.accent)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
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
              border: Border(top: BorderSide(color: c.line, width: 0.5)),
            ),
            padding: EdgeInsets.fromLTRB(
                16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
            child: Row(
              children: [
                Expanded(
                  child: RbBtn(
                    label: 'Download',
                    variant: RbBtnVariant.outline,
                    size: RbBtnSize.lg,
                    onPressed: () {},
                  ),
                ),
                if (inv.amountDueNum > 0) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: RbBtn(
                      label: 'Pay ${fmtMoney(inv.amountDueNum)}',
                      variant: RbBtnVariant.accent,
                      size: RbBtnSize.lg,
                      onPressed: () {},
                    ),
                  ),
                ],
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
}

class _InvLineRow extends StatelessWidget {
  const _InvLineRow({required this.line, required this.isFirst});
  final SalesInvoiceLine line;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.productName ?? line.sku,
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: c.ink)),
                Text('${line.qty} × ${fmtMoney(line.unitPriceNum)}',
                    style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
              ],
            ),
          ),
          Text(fmtMoney(line.lineTotalNum),
              style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w600, color: c.ink)),
        ],
      ),
    );
  }
}
