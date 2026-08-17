import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/invoice.dart';
import '../../core/services/invoice_pdf.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/kv_row.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_button.dart';
import '../../app/theme_provider.dart';

final _invoiceDetailProvider =
    FutureProvider.autoDispose.family<InvoiceDetailDto, ({String outletId, String invoiceId})>(
  (ref, args) =>
      ref.read(outletPortalClientProvider).invoiceDetail(args.outletId, args.invoiceId),
);

class InvoiceDetailScreen extends ConsumerWidget {
  final String invoiceId;
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final outletId = ref.watch(sessionControllerProvider).outletId;
    final invoiceAsync = ref.watch(
        _invoiceDetailProvider((outletId: outletId, invoiceId: invoiceId)));

    return Scaffold(
      backgroundColor: c.bg,
      body: invoiceAsync.when(
        data: (inv) => _Body(invoice: inv, c: c, ref: ref),
        loading: () => _Loading(c: c),
        error: (_, __) => Center(
            child: Text('Failed to load invoice',
                style: TextStyle(color: c.textMute))),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  final InvoiceDetailDto invoice;
  final AppThemeColors c;
  final WidgetRef ref;
  const _Body({required this.invoice, required this.c, required this.ref});

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  bool _downloading = false;

  InvoiceDetailDto get inv => widget.invoice;
  AppThemeColors get c => widget.c;

  Future<void> _downloadPdf() async {
    setState(() => _downloading = true);
    try {
      final profile = await widget.ref
          .read(outletPortalClientProvider)
          .myProfile();
      final bytes = await buildInvoicePdf(inv, profile);
      await Printing.sharePdf(
        bytes: bytes,
        filename: '${inv.invoiceNumber}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Failed to generate PDF: $e'),
              backgroundColor: c.red),
        );
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final due = parseAmount(inv.amountDue);
    final overdue = () {
      final dd = tryParseDate(inv.dueDate);
      return dd != null && dd.isBefore(DateTime.now()) && due > 0;
    }();

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: OutletAppBar(
            title: inv.invoiceNumber,
            subtitle: 'INVOICE',
            c: c,
            showBack: true,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              if (overdue)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(13),
                  decoration: BoxDecoration(
                    color: c.redSoft,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: c.red.withOpacity(0.25)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.warning_amber_outlined,
                          color: c.redText, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Payment overdue — ${fmtINR(due)} pending',
                          style: AppTextStyles.labelBold(color: c.redText),
                        ),
                      ),
                    ],
                  ),
                ),
              AppCard(
                c: c,
                child: Column(
                  children: [
                    KVRow(label: 'Order', value: '#${inv.orderNumber}', c: c),
                    KVRow(label: 'Invoice date',
                        value: fmtDateStr(inv.invoiceDate), c: c),
                    KVRow(
                        label: 'Due date',
                        value: fmtDateStr(inv.dueDate),
                        c: c,
                        valueColor: overdue ? c.red : null),
                    if (inv.subtotal != null)
                      KVRow(label: 'Subtotal',
                          value: fmtINR(parseAmount(inv.subtotal!)), c: c),
                    if (inv.discountAmount != null)
                      KVRow(
                          label: 'Discount',
                          value: '− ${fmtINR(parseAmount(inv.discountAmount!))}',
                          c: c,
                          valueColor: c.green),
                    ...inv.charges.map((ch) => KVRow(
                          label: ch.name,
                          value: fmtINR(parseAmount(ch.amount)),
                          c: c,
                        )),
                    KVRow(label: 'Total',
                        value: fmtINR(parseAmount(inv.total)), c: c),
                    KVRow(
                        label: 'Paid',
                        value: fmtINR(parseAmount(inv.amountPaid)),
                        c: c,
                        valueColor: c.green),
                    KVTotalRow(
                      label: 'Balance due',
                      value: fmtINR(due),
                      c: c,
                      valueColor: due > 0 ? c.red : c.green,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (inv.lines.isNotEmpty) ...[
                Text('Line items',
                    style: AppTextStyles.sectionTitle(color: c.text)),
                const SizedBox(height: 10),
                AppCard(
                  c: c,
                  child: Column(
                    children: [
                      for (int i = 0; i < inv.lines.length; i++)
                        KVRow(
                          label:
                              '${inv.lines[i].sku} × ${inv.lines[i].qty}',
                          value: fmtINR(
                              parseAmount(inv.lines[i].lineTotal)),
                          c: c,
                          last: i == inv.lines.length - 1,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],
              AppButton(
                label: _downloading ? 'Generating PDF…' : 'Download as PDF',
                icon: Icons.download_outlined,
                c: c,
                fullWidth: true,
                variant: AppButtonVariant.soft,
                loading: _downloading,
                onTap: _downloading ? null : _downloadPdf,
              ),
            ]),
          ),
        ),
      ],
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
          5,
          (_) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
                height: 52,
                decoration: BoxDecoration(
                    color: c.sunken,
                    borderRadius: BorderRadius.circular(16))),
          ),
        ),
      );
}
