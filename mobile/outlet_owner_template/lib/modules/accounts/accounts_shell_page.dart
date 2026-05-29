import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/outlet_portal_client.dart';
import '../../core/api/payments_client.dart';
import '../../core/outlet/outlet_context.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/error_view.dart';

// ── Providers ────────────────────────────────────────────────────────────────

final _invoicesProvider = FutureProvider.autoDispose
    .family<PagedResult<InvoiceListItem>, ({String outletId, String? q})>(
        (ref, args) {
  return ref
      .watch(outletPortalClientProvider)
      .invoiceHistory(args.outletId, q: args.q);
});

final _paymentsProvider = FutureProvider.autoDispose
    .family<PagedResult<PaymentItem>, String>((ref, outletId) {
  return ref.watch(paymentsClientProvider).list(outletId);
});

final _agingProvider =
    FutureProvider.autoDispose.family<ArAgingResult, String>((ref, outletId) {
  return ref.watch(outletPortalClientProvider).arAging(outletId, limit: 100);
});

// ── Shell ─────────────────────────────────────────────────────────────────────

class AccountsShellPage extends ConsumerStatefulWidget {
  const AccountsShellPage({super.key});

  @override
  ConsumerState<AccountsShellPage> createState() => _AccountsShellPageState();
}

class _AccountsShellPageState extends ConsumerState<AccountsShellPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final outletId = ref.watch(outletIdProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Financials'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Invoices'),
            Tab(text: 'Payments'),
          ],
        ),
      ),
      body: outletId == null
          ? const EmptyState(
              icon: Icons.store_outlined,
              message: 'No outlet linked to this account.',
            )
          : Column(
              children: [
                _FinancialHero(outletId: outletId),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: const [
                      _InvoiceTab(),
                      _PaymentTab(),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _FinancialHero extends ConsumerWidget {
  const _FinancialHero({required this.outletId});

  final String outletId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final aging = ref.watch(_agingProvider(outletId));

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
      child: aging.when(
        loading: () => Container(
          height: 160,
          decoration: BoxDecoration(
            color: Colors.grey.shade300,
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        error: (_, __) => ErrorView(
          message: 'Could not load AR aging.',
          onRetry: () => ref.refresh(_agingProvider(outletId).future),
        ),
        data: (data) {
          final bars = <(String, String, Color)>[
            ('Current', data.summary.current, const Color(0xFF6366F1)),
            ('1-30', data.summary.bucket1_30, const Color(0xFFF59E0B)),
            ('31-60', data.summary.bucket31_60, const Color(0xFFFB7185)),
            ('61-90', data.summary.bucket61_90, const Color(0xFFEF4444)),
            ('90+', data.summary.bucket90Plus, const Color(0xFFB91C1C)),
          ];
          final total = double.tryParse(data.summary.totalOutstanding) ?? 0;

          return Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF09090B),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total outstanding',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.white70),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '₹${_fmt(data.summary.totalOutstanding)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...bars.map((b) {
                      final amount = double.tryParse(b.$2) ?? 0;
                      final pct = total <= 0
                          ? 0.0
                          : (amount / total).clamp(0.0, 1.0).toDouble();
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 52,
                              child: Text(
                                b.$1,
                                style: const TextStyle(
                                    color: Colors.white70, fontSize: 11),
                              ),
                            ),
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: pct,
                                  minHeight: 7,
                                  backgroundColor: Colors.white12,
                                  valueColor:
                                      AlwaysStoppedAnimation<Color>(b.$3),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(
                              width: 80,
                              child: Text(
                                '₹${_fmt(b.$2)}',
                                textAlign: TextAlign.right,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ── Invoice Tab ───────────────────────────────────────────────────────────────

class _InvoiceTab extends ConsumerStatefulWidget {
  const _InvoiceTab();

  @override
  ConsumerState<_InvoiceTab> createState() => _InvoiceTabState();
}

class _InvoiceTabState extends ConsumerState<_InvoiceTab>
    with AutomaticKeepAliveClientMixin {
  final _searchCtrl = TextEditingController();
  String? _q;

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return const EmptyState(
        icon: Icons.store_outlined,
        message: 'No outlet linked to this account.',
      );
    }

    final invoices = ref.watch(_invoicesProvider((outletId: outletId, q: _q)));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
          child: TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search by invoice or order number…',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: _searchCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() => _q = null);
                      },
                    )
                  : null,
            ),
            onChanged: (v) => setState(() => _q = v.isEmpty ? null : v),
          ),
        ),
        Expanded(
          child: invoices.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => ErrorView(
              message: 'Could not load invoices.',
              onRetry: () => ref.refresh(
                  _invoicesProvider((outletId: outletId, q: _q)).future),
            ),
            data: (result) {
              if (result.items.isEmpty) {
                return const EmptyState(
                  icon: Icons.description_outlined,
                  message: 'No invoices yet.',
                );
              }
              return RefreshIndicator(
                onRefresh: () => ref.refresh(
                    _invoicesProvider((outletId: outletId, q: _q)).future),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
                  itemCount: result.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _InvoiceCard(invoice: result.items[i]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});
  final InvoiceListItem invoice;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(invoice.invoiceDate);
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : invoice.invoiceDate;
    final due = (double.tryParse(invoice.amountDue) ?? 0) > 0;

    return Card(
      child: InkWell(
        onTap: () => context.push('/invoices/${invoice.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color:
                      due ? const Color(0xFFFFF7ED) : const Color(0xFFEAFBF3),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.receipt_long_outlined,
                  color:
                      due ? const Color(0xFFF97316) : const Color(0xFF10B981),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(invoice.invoiceNumber,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(dateStr, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('₹${_fmt(invoice.total)}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(
                    due ? 'Due ₹${_fmt(invoice.amountDue)}' : 'Paid',
                    style: TextStyle(
                      color: due
                          ? const Color(0xFFEF4444)
                          : const Color(0xFF10B981),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 18, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Payment Tab ───────────────────────────────────────────────────────────────

class _PaymentTab extends ConsumerStatefulWidget {
  const _PaymentTab();

  @override
  ConsumerState<_PaymentTab> createState() => _PaymentTabState();
}

class _PaymentTabState extends ConsumerState<_PaymentTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final outletId = ref.watch(outletIdProvider);
    if (outletId == null) {
      return const EmptyState(
        icon: Icons.store_outlined,
        message: 'No outlet linked to this account.',
      );
    }

    final payments = ref.watch(_paymentsProvider(outletId));

    return payments.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => ErrorView(
        message: 'Could not load payments.',
        onRetry: () => ref.refresh(_paymentsProvider(outletId).future),
      ),
      data: (result) {
        if (result.items.isEmpty) {
          return const EmptyState(
            icon: Icons.payment_outlined,
            message: 'No payments recorded yet.',
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.refresh(_paymentsProvider(outletId).future),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 80),
            itemCount: result.items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _PaymentCard(payment: result.items[i]),
          ),
        );
      },
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.payment});
  final PaymentItem payment;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(payment.paymentDate);
    final dateStr = date != null
        ? '${date.day}/${date.month}/${date.year}'
        : payment.paymentDate;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle_outline,
                    color: Color(0xFF10B981), size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '₹${_fmt(payment.amount)} received',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  dateStr,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: Colors.grey.shade600),
                ),
              ],
            ),
            if (payment.reference != null) ...[
              const SizedBox(height: 6),
              Text('Ref: ${payment.reference}',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
            if (payment.description != null) ...[
              const SizedBox(height: 2),
              Text(payment.description!,
                  style: Theme.of(context).textTheme.bodySmall),
            ],
            if (payment.allocations.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Applied to ${payment.allocations.length} invoice${payment.allocations.length == 1 ? '' : 's'}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _fmt(String value) {
  final d = double.tryParse(value) ?? 0;
  return d.toStringAsFixed(2).replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (m) => '${m[1]},',
      );
}
