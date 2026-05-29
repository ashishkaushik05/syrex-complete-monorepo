import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/sales_client.dart';
import '../../core/auth/session_controller.dart';
import '../../modules/field/providers/field_providers.dart';
import '../../modules/field/models/field_models.dart';
import '../../shared/widgets/rb_components.dart';

// ─── Data provider ─────────────────────────────────────────────────────────────

class _DashData {
  const _DashData({
    required this.outlets,
    required this.invoices,
    required this.recentOrders,
  });
  final List<SalesOutlet> outlets;
  final List<SalesInvoice> invoices;
  final List<SalesOrder> recentOrders;

  double get outstanding =>
      invoices.fold(0.0, (s, inv) => s + inv.amountDueNum);
  int get openInvoices => invoices.where((i) => i.amountDueNum > 0).length;
  int get overdueInvoices =>
      invoices.where((i) => i.status == 'overdue').length;
}

final _dashProvider = FutureProvider.autoDispose<_DashData>((ref) async {
  final client = ref.watch(salesClientProvider);
  final results = await Future.wait([
    client.outlets(),
    client.invoices(limit: 50),
    client.myOrders(limit: 3),
  ]);
  return _DashData(
    outlets: results[0] as List<SalesOutlet>,
    invoices: (results[1] as PagedResult<SalesInvoice>).items,
    recentOrders: (results[2] as PagedResult<SalesOrder>).items,
  );
});

// ─── Page ──────────────────────────────────────────────────────────────────────

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionControllerProvider).user;
    final asyncData = ref.watch(_dashProvider);
    final shiftAsync = ref.watch(activeShiftProvider);
    final isFieldEnabled = user?.isFieldEnabled ?? false;
    final c = rbColors(context);

    final greeting = _greeting();
    final initials = _initials(user?.email ?? '');

    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: RbColors.accent,
        onRefresh: () async {
          ref.invalidate(_dashProvider);
          ref.invalidate(activeShiftProvider);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: _TopBar(
                greeting: greeting,
                name: user?.email.split('@').first ?? 'there',
                initials: initials,
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  asyncData.when(
                    loading: () => const _LoadingSkeleton(),
                    error: (e, _) => _ErrorCard(message: e.toString()),
                    data: (data) => _DashBody(
                      data: data,
                      shiftAsync: shiftAsync,
                      isFieldEnabled: isFieldEnabled,
                      context: context,
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  static String _initials(String email) {
    final name = email.split('@').first;
    final parts = name.split(RegExp(r'[._-]'));
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }
}

// ─── Top bar ───────────────────────────────────────────────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar(
      {required this.greeting, required this.name, required this.initials});
  final String greeting;
  final String name;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, MediaQuery.of(context).padding.top + 12, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(greeting,
                    style: GoogleFonts.inter(fontSize: 13, color: c.muted)),
                Text(
                  name,
                  style: GoogleFonts.inter(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: c.ink,
                      height: 1.2),
                ),
              ],
            ),
          ),
          RbAvatar(initials: initials, size: 36),
        ],
      ),
    );
  }
}

// ─── Body ──────────────────────────────────────────────────────────────────────

class _DashBody extends StatelessWidget {
  const _DashBody({
    required this.data,
    required this.shiftAsync,
    required this.isFieldEnabled,
    required this.context,
  });
  final _DashData data;
  final AsyncValue<ShiftModel?> shiftAsync;
  final bool isFieldEnabled;
  final BuildContext context;

  @override
  Widget build(BuildContext ctx) {
    final creditLimit =
        data.outlets.isNotEmpty ? data.outlets.first.creditLimitNum : 0.0;
    final creditPct =
        creditLimit > 0 ? (data.outstanding / creditLimit).clamp(0.0, 1.0) : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),

        // Hero balance card
        _BalanceCard(
          outstanding: data.outstanding,
          openInvoices: data.openInvoices,
          creditPct: creditPct,
          creditLimit: creditLimit,
        ),
        const SizedBox(height: 12),

        // Quick actions
        _QuickActions(isFieldEnabled: isFieldEnabled),
        const SizedBox(height: 16),

        // Stats row
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Total outlets',
                value: '${data.outlets.length}',
                onTap: () {},
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                label: 'Open invoices',
                value: '${data.openInvoices}',
                tone: data.openInvoices > 0 ? RbTone.warn : RbTone.neutral,
                onTap: () => ctx.push('/finance'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Field Sense card
        if (isFieldEnabled) ...[
          _FieldSenseCard(shiftAsync: shiftAsync),
          const SizedBox(height: 16),
        ],

        // Recent orders
        if (data.recentOrders.isNotEmpty) ...[
          RbSection(label: 'Recent orders', action: 'See all', onAction: () => ctx.push('/orders')),
          const SizedBox(height: 8),
          RbCard(
            child: Column(
              children: [
                for (int i = 0; i < data.recentOrders.length; i++)
                  _OrderRow(
                    order: data.recentOrders[i],
                    isFirst: i == 0,
                    onTap: () => ctx.push('/orders/${data.recentOrders[i].id}'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Needs attention
        if (data.overdueInvoices > 0) ...[
          RbSection(label: 'Needs attention'),
          const SizedBox(height: 8),
          ...data.invoices
              .where((i) => i.status == 'overdue' || i.amountDueNum > 0)
              .take(3)
              .map((inv) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: _AttentionRow(invoice: inv),
                  )),
        ],
      ],
    );
  }
}

// ─── Balance hero card ─────────────────────────────────────────────────────────

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({
    required this.outstanding,
    required this.openInvoices,
    required this.creditPct,
    required this.creditLimit,
  });
  final double outstanding;
  final int openInvoices;
  final double creditPct;
  final double creditLimit;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('Outstanding balance',
                    style: GoogleFonts.inter(fontSize: 13, color: c.muted)),
                const Spacer(),
                if (openInvoices > 0)
                  RbChip(
                      label: '$openInvoices open',
                      tone: RbTone.warn),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              fmtMoney(outstanding),
              style: GoogleFonts.inter(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: c.ink,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            if (creditLimit > 0) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Text('Credit used',
                      style:
                          GoogleFonts.inter(fontSize: 12, color: c.muted)),
                  const Spacer(),
                  Text(
                    '${(creditPct * 100).toStringAsFixed(0)}%',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _creditColor(creditPct)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              RbProgressBar(value: creditPct),
            ],
          ],
        ),
      ),
    );
  }

  static Color _creditColor(double pct) {
    if (pct >= 0.8) return RbColors.danger;
    if (pct >= 0.6) return RbColors.warn;
    return RbColors.accent;
  }
}

// ─── Quick actions grid ────────────────────────────────────────────────────────

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.isFieldEnabled});
  final bool isFieldEnabled;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final actions = [
      _QA(icon: Icons.add_shopping_cart_outlined, label: 'New order', onTap: () => context.push('/orders/create')),
      _QA(icon: Icons.grid_view_outlined, label: 'Catalog', onTap: () => context.go('/catalog')),
      _QA(icon: Icons.receipt_long_outlined, label: 'Invoices', onTap: () => context.push('/finance')),
      _QA(
        icon: Icons.add_location_alt_outlined,
        label: 'Log visit',
        enabled: isFieldEnabled,
        onTap: isFieldEnabled ? () => context.push('/field/visit') : null,
      ),
    ];

    return Row(
      children: actions
          .map((a) => Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: _QuickActionTile(qa: a, colors: c),
                ),
              ))
          .toList(),
    );
  }
}

class _QA {
  const _QA({required this.icon, required this.label, this.onTap, this.enabled = true});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool enabled;
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({required this.qa, required this.colors});
  final _QA qa;
  final RbThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return RbCard(
      onTap: qa.onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Column(
          children: [
            Icon(qa.icon,
                size: 22,
                color: qa.enabled ? colors.ink : colors.muted),
            const SizedBox(height: 6),
            Text(
              qa.label,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: qa.enabled ? colors.ink2 : colors.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  const _StatCard(
      {required this.label,
      required this.value,
      this.tone = RbTone.neutral,
      this.onTap});
  final String label;
  final String value;
  final RbTone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbCard(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
                style: GoogleFonts.inter(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: c.ink)),
            const SizedBox(height: 2),
            Text(label,
                style:
                    GoogleFonts.inter(fontSize: 12, color: c.muted)),
          ],
        ),
      ),
    );
  }
}

// ─── Field Sense card ─────────────────────────────────────────────────────────

class _FieldSenseCard extends ConsumerWidget {
  const _FieldSenseCard({required this.shiftAsync});
  final AsyncValue<ShiftModel?> shiftAsync;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = rbColors(context);
    return RbCard(
      onTap: () => context.go('/field'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.location_on_outlined, size: 16, color: c.muted),
                const SizedBox(width: 6),
                Text('Field Sense',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: c.ink2)),
                const Spacer(),
                shiftAsync.maybeWhen(
                  data: (s) => StatusDot(
                    tone: s != null ? RbTone.success : RbTone.neutral,
                    pulse: s != null,
                    label: s != null ? 'Live' : 'Offline',
                  ),
                  orElse: () => const SizedBox.shrink(),
                ),
              ],
            ),
            const SizedBox(height: 10),
            shiftAsync.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (_, __) => Text('Unavailable',
                  style: GoogleFonts.inter(fontSize: 13, color: c.muted)),
              data: (shift) => shift == null
                  ? Text('No active shift',
                      style: GoogleFonts.inter(fontSize: 13, color: c.muted))
                  : Text(
                      'Active since ${_time(shift.startedAt)}',
                      style: GoogleFonts.inter(fontSize: 13, color: c.ink2),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  static String _time(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return '—';
    final h = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }
}

// ─── Order row ─────────────────────────────────────────────────────────────────

class _OrderRow extends StatelessWidget {
  const _OrderRow(
      {required this.order, required this.isFirst, required this.onTap});
  final SalesOrder order;
  final bool isFirst;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.orderNumber,
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: c.ink)),
                const SizedBox(height: 2),
                Text(_fmtDate(order.orderDate),
                    style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              StatusChip.order(order.status),
              const SizedBox(height: 4),
              Text(fmtMoney(order.totalValueNum),
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: c.ink)),
            ],
          ),
        ],
      ),
    );
  }

  static String _fmtDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const months = [
      'Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  }
}

// ─── Attention row ─────────────────────────────────────────────────────────────

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({required this.invoice});
  final SalesInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbCard(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.error_outline, size: 16, color: RbColors.danger),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(invoice.invoiceNumber,
                      style: GoogleFonts.jetBrainsMono(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: c.ink)),
                  Text('Due ${invoice.dueDate ?? '—'}',
                      style:
                          GoogleFonts.inter(fontSize: 12, color: c.muted)),
                ],
              ),
            ),
            Text(fmtMoney(invoice.amountDueNum),
                style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: RbColors.danger)),
          ],
        ),
      ),
    );
  }
}

// ─── Loading / error ───────────────────────────────────────────────────────────

class _LoadingSkeleton extends StatelessWidget {
  const _LoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 8),
        Container(
            height: 130,
            decoration: BoxDecoration(
                color: Colors.grey.shade200,
                borderRadius: BorderRadius.circular(12))),
        const SizedBox(height: 12),
        const LinearProgressIndicator(minHeight: 2, color: RbColors.accent),
      ],
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return RbEmpty(
      icon: Icons.cloud_off_outlined,
      title: 'Could not load dashboard',
      sub: message,
    );
  }
}
