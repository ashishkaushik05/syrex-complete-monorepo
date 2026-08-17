import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/api/payments_client.dart';
import '../../core/models/payment.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/app_card.dart';
import '../../app/theme_provider.dart';

final _paymentsProvider = FutureProvider.autoDispose<PagedPayments>(
  (ref) => ref.read(paymentsClientProvider).list(),
);

class PaymentsListScreen extends ConsumerWidget {
  const PaymentsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final paymentsAsync = ref.watch(_paymentsProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutletAppBar(title: 'Payments', c: c, showBack: true),
          Expanded(
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () async => ref.invalidate(_paymentsProvider),
              child: paymentsAsync.when(
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.payments_outlined,
                          title: 'No payments recorded',
                          sub: 'Payment receipts linked to your account will appear here.',
                          c: c,
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                    itemCount: page.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _PaymentTile(
                      payment: page.items[i],
                      onTap: () => context.push('/more/payments/${page.items[i].id}'),
                      c: c,
                    ),
                  );
                },
                loading: () => _Skeleton(c: c),
                error: (_, __) => Center(
                  child: Text('Failed to load payments', style: TextStyle(color: c.textMute)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  final PaymentDto payment;
  final VoidCallback onTap;
  final AppThemeColors c;
  const _PaymentTile({required this.payment, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      c: c,
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: payment.voided ? c.redSoft : c.greenSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              payment.voided ? Icons.cancel_outlined : Icons.check_circle_outline,
              color: payment.voided ? c.redText : c.greenText,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fmtDateStr(payment.paymentDate), style: AppTextStyles.labelBold(color: c.text)),
                if (payment.reference != null)
                  Text('Ref: ${payment.reference}', style: AppTextStyles.smallLabel(color: c.textMute)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(fmtINR(parseAmount(payment.amount)), style: AppTextStyles.amountMd(color: c.text)),
              if (payment.voided)
                Text('Voided', style: AppTextStyles.smallLabelBold(color: c.redText)),
            ],
          ),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right, size: 17, color: c.textFaint),
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  final AppThemeColors c;
  const _Skeleton({required this.c});

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        itemCount: 5,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, __) => Container(
          height: 72,
          decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(18)),
        ),
      );
}
