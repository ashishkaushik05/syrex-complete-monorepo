import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/api/payments_client.dart';
import '../../core/models/payment.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/kv_row.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/status_badge.dart';
import '../../app/theme_provider.dart';

final _paymentDetailProvider = FutureProvider.autoDispose.family<PaymentDetailDto, String>(
  (ref, id) => ref.read(paymentsClientProvider).getById(id),
);

class PaymentDetailScreen extends ConsumerWidget {
  final String paymentId;
  const PaymentDetailScreen({super.key, required this.paymentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final paymentAsync = ref.watch(_paymentDetailProvider(paymentId));

    return Scaffold(
      backgroundColor: c.bg,
      body: paymentAsync.when(
        data: (p) => _Body(payment: p, c: c),
        loading: () => _Loading(c: c),
        error: (_, __) => Center(child: Text('Failed to load payment', style: TextStyle(color: c.textMute))),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final PaymentDetailDto payment;
  final AppThemeColors c;
  const _Body({required this.payment, required this.c});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: OutletAppBar(
            title: 'Payment',
            subtitle: fmtDateStr(payment.paymentDate),
            c: c,
            showBack: true,
            trailing: payment.voided ? StatusBadge(status: 'voided', c: c) : null,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              AppCard(
                c: c,
                child: Column(
                  children: [
                    KVRow(label: 'Amount', value: fmtINR(parseAmount(payment.amount)), c: c,
                        valueColor: payment.voided ? c.redText : c.greenText),
                    KVRow(label: 'Date', value: fmtDateStr(payment.paymentDate), c: c),
                    if (payment.reference != null)
                      KVRow(label: 'Reference', value: payment.reference!, c: c),
                    if (payment.description != null)
                      KVRow(label: 'Description', value: payment.description!, c: c),
                    if (payment.voided && payment.voidReason != null)
                      KVRow(label: 'Void reason', value: payment.voidReason!, c: c, valueColor: c.redText,
                          last: payment.allocations.isEmpty),
                  ],
                ),
              ),
              if (payment.allocations.isNotEmpty) ...[
                const SizedBox(height: 16),
                AppCard(
                  c: c,
                  child: Column(
                    children: [
                      for (int i = 0; i < payment.allocations.length; i++)
                        KVRow(
                          label: 'Invoice #${payment.allocations[i].invoiceNumber}',
                          value: fmtINR(parseAmount(payment.allocations[i].amount)),
                          c: c,
                          last: i == payment.allocations.length - 1,
                        ),
                    ],
                  ),
                ),
              ],
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
          4,
          (_) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(height: 52, decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(16))),
          ),
        ),
      );
}
