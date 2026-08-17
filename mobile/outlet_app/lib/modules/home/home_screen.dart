import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/outlet.dart';
import '../../core/models/order.dart';
import '../../core/models/dispatch.dart';
import '../../core/models/invoice.dart';
import '../../shared/widgets/section_header.dart';
import '../../shared/widgets/stat_card.dart';
import '../../shared/widgets/order_list_tile.dart';
import '../../shared/widgets/dispatch_list_tile.dart';
import '../../shared/widgets/invoice_list_tile.dart';
import '../../app/theme_provider.dart';

// Providers
final _summaryProvider = FutureProvider.autoDispose.family<OutletSummaryDto, String>(
  (ref, outletId) => ref.read(outletPortalClientProvider).summary(outletId),
);
final _recentOrdersProvider = FutureProvider.autoDispose.family<PagedOrders, String>(
  (ref, outletId) => ref.read(outletPortalClientProvider).orderHistory(outletId, limit: 3),
);
final _dispatchesProvider = FutureProvider.autoDispose.family<PagedDispatches, String>(
  (ref, outletId) => ref.read(outletPortalClientProvider).dispatchHistory(outletId, limit: 5),
);
final _invoicesProvider = FutureProvider.autoDispose.family<PagedInvoices, String>(
  (ref, outletId) => ref.read(outletPortalClientProvider).invoiceHistory(outletId, limit: 5),
);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final session = ref.watch(sessionControllerProvider);
    final outletId = session.outletId;
    final user = session.user;

    final summaryAsync = ref.watch(_summaryProvider(outletId));
    final ordersAsync = ref.watch(_recentOrdersProvider(outletId));
    final dispatchesAsync = ref.watch(_dispatchesProvider(outletId));
    final invoicesAsync = ref.watch(_invoicesProvider(outletId));

    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: c.accent,
        onRefresh: () async {
          ref.invalidate(_summaryProvider(outletId));
          ref.invalidate(_recentOrdersProvider(outletId));
          ref.invalidate(_dispatchesProvider(outletId));
          ref.invalidate(_invoicesProvider(outletId));
        },
        child: CustomScrollView(
          slivers: [
            // Identity header
            SliverToBoxAdapter(
              child: _IdentityHeader(c: c, user: user, onBell: () {}),
            ),

            // Scrollable content
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 22),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Outstanding balance banner
                  summaryAsync.when(
                    data: (s) => _BalanceBanner(c: c, summary: s, onViewInvoices: () => context.go('/invoices')),
                    loading: () => _BalanceBannerSkeleton(c: c),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 16),

                  // New order CTA
                  _NewOrderCta(c: c, onTap: () => context.push('/orders/new')),
                  const SizedBox(height: 22),

                  // Stats row
                  summaryAsync.when(
                    data: (s) => _StatsRow(c: c, summary: s),
                    loading: () => _StatsRowSkeleton(c: c),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 22),

                  // Recent orders
                  SectionHeader(title: 'Recent orders', c: c, action: 'See all', onAction: () => context.go('/orders')),
                  ordersAsync.when(
                    data: (page) => Column(
                      children: page.items.map((o) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: OrderListTile(order: o, onTap: () => context.push('/orders/${o.id}'), c: c),
                      )).toList(),
                    ),
                    loading: () => _ListSkeleton(c: c, count: 2),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 22),

                  // Active dispatches
                  SectionHeader(title: 'Active dispatches', c: c, action: 'See all', onAction: () => context.go('/dispatches')),
                  dispatchesAsync.when(
                    data: (page) {
                      final active = page.items.where((d) => d.deliveryStatus == 'in_transit').toList();
                      if (active.isEmpty) return Padding(
                        padding: const EdgeInsets.only(bottom: 22),
                        child: Text('No active shipments', style: AppTextStyles.label(color: c.textFaint)),
                      );
                      return Column(
                        children: active.map((d) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: DispatchListTile(dispatch: d, onTap: () => context.push('/dispatches/${d.id}'), c: c),
                        )).toList(),
                      );
                    },
                    loading: () => _ListSkeleton(c: c, count: 1),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 22),

                  // Overdue invoices
                  SectionHeader(title: 'Overdue invoices', c: c, action: 'See all', onAction: () => context.go('/invoices')),
                  invoicesAsync.when(
                    data: (page) {
                      final overdue = page.items.where((i) {
                        final dd = tryParseDate(i.dueDate);
                        return dd != null && dd.isBefore(DateTime.now()) && parseAmount(i.amountDue) > 0;
                      }).toList();
                      if (overdue.isEmpty) return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Text('No overdue invoices', style: AppTextStyles.label(color: c.textFaint)),
                      );
                      return Column(
                        children: overdue.map((i) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: InvoiceListTile(key: Key('invoice-tile-${i.id}'), invoice: i, onTap: () => context.push('/invoices/${i.id}'), c: c),
                        )).toList(),
                      );
                    },
                    loading: () => _ListSkeleton(c: c, count: 1),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Sub-widgets ────────────────────────────────────────────────

class _IdentityHeader extends StatelessWidget {
  final AppThemeColors c;
  final dynamic user;
  final VoidCallback onBell;

  const _IdentityHeader({required this.c, required this.user, required this.onBell});

  @override
  Widget build(BuildContext context) {
    final name = user?.name ?? 'Outlet';
    final initials = name.length >= 2 ? name.substring(0, 2).toUpperCase() : name.toUpperCase();
    return Container(
      color: c.bg,
      padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 12, 18, 14),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(14)),
            child: Center(child: Text(initials, style: AppTextStyles.label(color: Colors.white).copyWith(fontSize: 16, fontWeight: FontWeight.w800))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Good morning', style: AppTextStyles.smallLabel(color: c.textMute)),
                Text(name, style: AppTextStyles.dispatchTitle(color: c.text).copyWith(fontSize: 17), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          GestureDetector(
            onTap: onBell,
            child: Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(13),
                border: Border.all(color: c.line),
                boxShadow: [c.shadow],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Icon(Icons.notifications_outlined, size: 21, color: c.text),
                  Positioned(
                    top: 9, right: 10,
                    child: Container(
                      key: const Key('notification-dot'),
                      width: 8, height: 8,
                      decoration: BoxDecoration(color: c.red, shape: BoxShape.circle,
                        border: Border.all(color: c.surface, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BalanceBanner extends StatelessWidget {
  final AppThemeColors c;
  final OutletSummaryDto summary;
  final VoidCallback onViewInvoices;

  const _BalanceBanner({required this.c, required this.summary, required this.onViewInvoices});

  @override
  Widget build(BuildContext context) {
    final outstanding = parseAmount(summary.outstandingLive);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: const Alignment(-0.5, -0.8),
          end: const Alignment(0.5, 0.8),
          colors: [c.accent, _darken(c.accent)],
        ),
        boxShadow: [c.shadow],
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Background circles
          Positioned(right: -30, top: -30,
            child: Container(width: 140, height: 140, decoration: BoxDecoration(color: Colors.white.withOpacity(0.08), shape: BoxShape.circle))),
          Positioned(right: 26, bottom: -46,
            child: Container(width: 90, height: 90, decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), shape: BoxShape.circle))),

          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.currency_rupee, size: 15, color: Colors.white70),
                  const SizedBox(width: 4),
                  Text('OUTSTANDING BALANCE',
                    style: AppTextStyles.caption(color: Colors.white70).copyWith(letterSpacing: 0.2, fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 6),
              Text(fmtINR(outstanding), style: AppTextStyles.balanceBanner(color: Colors.white)),
              const SizedBox(height: 14),
              // Credit bar placeholder — summary doesn't include creditLimit
              // so we just show invoice count
              Text('${summary.openInvoicesCount} open invoice${summary.openInvoicesCount == 1 ? '' : 's'} · ${summary.ordersCount} total orders',
                style: AppTextStyles.caption(color: Colors.white70)),
              const SizedBox(height: 15),
              GestureDetector(
                onTap: onViewInvoices,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.92),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('View invoices', style: AppTextStyles.bodyBold(color: c.greenText)),
                      const SizedBox(width: 7),
                      Icon(Icons.arrow_forward, size: 17, color: c.greenText),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _darken(Color color) {
    final hsl = HSLColor.fromColor(color);
    return hsl.withLightness((hsl.lightness * 0.7).clamp(0.0, 1.0)).toColor();
  }
}

class _BalanceBannerSkeleton extends StatelessWidget {
  final AppThemeColors c;
  const _BalanceBannerSkeleton({required this.c});

  @override
  Widget build(BuildContext context) => Container(
    height: 160,
    decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(22)),
  );
}

class _NewOrderCta extends StatelessWidget {
  final AppThemeColors c;
  final VoidCallback onTap;
  const _NewOrderCta({required this.c, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: c.accentBorder, style: BorderStyle.solid, width: 1.5),
        ),
        child: Row(
          children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(13), boxShadow: [c.shadow]),
              child: const Icon(Icons.add, size: 24, color: Colors.white),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Place a new order', style: AppTextStyles.bodyHeavy(color: c.text).copyWith(fontSize: 15)),
                  Text('Browse catalog & build your order', style: AppTextStyles.smallLabel(color: c.textMute)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 20, color: c.textFaint),
          ],
        ),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  final AppThemeColors c;
  final OutletSummaryDto summary;
  const _StatsRow({required this.c, required this.summary});

  @override
  Widget build(BuildContext context) => Row(
    children: [
      StatCard(icon: Icons.schedule, iconBg: c.amberSoft, iconColor: c.amberText,
        value: '${summary.ordersCount}', label: 'Total orders', c: c),
      const SizedBox(width: 10),
      StatCard(icon: Icons.local_shipping_outlined, iconBg: c.blueSoft, iconColor: c.blueText,
        value: '—', label: 'In transit', c: c, onTap: () => context.go('/dispatches')),
      const SizedBox(width: 10),
      StatCard(icon: Icons.warning_amber_outlined, iconBg: c.redSoft, iconColor: c.redText,
        value: '${summary.openInvoicesCount}', label: 'Open invoices', c: c, onTap: () => context.go('/invoices')),
    ],
  );
}

class _StatsRowSkeleton extends StatelessWidget {
  final AppThemeColors c;
  const _StatsRowSkeleton({required this.c});

  @override
  Widget build(BuildContext context) => Row(
    children: List.generate(3, (_) => Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Container(height: 88, decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(16))),
      ),
    )),
  );
}

class _ListSkeleton extends StatelessWidget {
  final AppThemeColors c;
  final int count;
  const _ListSkeleton({required this.c, required this.count});

  @override
  Widget build(BuildContext context) => Column(
    children: List.generate(count, (i) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(height: 80, decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(18))),
    )),
  );
}
