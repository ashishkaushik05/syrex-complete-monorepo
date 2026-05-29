import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_typography.dart';
import 'package:outlet_owner_template/core/design/money_formatter.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_avatar.dart';
import 'package:outlet_owner_template/core/auth/session_controller.dart';

/// Sample order for mock data
class _SampleOrder {
  final String code;
  final String status;
  final double amount;

  _SampleOrder({
    required this.code,
    required this.status,
    required this.amount,
  });
}

/// Full-page dashboard screen for Routebook sales app.
/// Shows greeting, shift status (if field enabled), quick stats, invoices, and recent orders.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({
    super.key,
    this.shiftActive = false,
    this.onNav,
  });

  /// Whether a shift is currently active
  final bool shiftActive;

  /// Navigation callback: routes are 'invoices', 'orders', 'field', 'order:{id}'
  final void Function(String route)? onNav;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    // Derive isFieldEnabled from session user
    final isFieldEnabled = session.user?.isFieldEnabled ?? false;

    // Extract user greeting name (use first part of email or full name)
    final userName = session.user?.email.split('@').first ?? 'there';
    final now = DateTime.now();
    final greeting = _getGreeting();

    // Mock sample orders
    final sampleOrders = [
      _SampleOrder(code: 'ORD-2024-001', status: 'delivered', amount: 12450.0),
      _SampleOrder(code: 'ORD-2024-002', status: 'pending', amount: 8920.0),
      _SampleOrder(code: 'ORD-2024-003', status: 'cancelled', amount: 5680.0),
    ];

    // Status chip mappings
    const orderStatusMap = {
      'pending': ('PENDING', Color(0xFFF59E0B), Color(0xFFFEF3C7)),
      'delivered': ('DELIVERED', Color(0xFF10B981), Color(0xFFECFDF5)),
      'cancelled': ('CANCELLED', Color(0xFFEF4444), Color(0xFFFFE4E6)),
    };

    return Scaffold(
      backgroundColor: cs.bg,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            // Top bar with greeting, date, and avatar
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.pad,
                  AppSpacing.pad,
                  AppSpacing.pad,
                  AppSpacing.padLg,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Greeting + avatar row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '$greeting, ${userName.capitalize()}',
                                style: AppTextStyles.h2(cs.ink),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _formatDate(now),
                                style: AppTextStyles.meta(cs.muted),
                              ),
                            ],
                          ),
                        ),
                        // Avatar (tap → profile)
                        GestureDetector(
                          onTap: () => onNav?.call('profile'),
                          child: RbAvatar(
                            initials: _getInitials(session.user?.email ?? ''),
                            size: AppSpacing.avatarMd,
                            backgroundColor: cs.accent,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // Shift status card (only if field enabled)
            if (isFieldEnabled)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                  child: _ShiftStatusCard(
                    active: shiftActive,
                    onStartShift: () => onNav?.call('field'),
                  ),
                ),
              ),

            if (isFieldEnabled) const SliverToBoxAdapter(child: SizedBox(height: 16)),

            // Quick stats row (Orders, Revenue, Visits)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _StatsRow(
                      stats: [
                        ('12', 'Orders today'),
                        ('₹48,320', 'Revenue today'),
                        ('7', 'Visits today'),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),

            // My invoices section
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                child: _InvoicesSummary(
                  totalDue: 125680,
                  overdueCount: 3,
                  onViewAll: () => onNav?.call('invoices'),
                ),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),

            // Recent orders section
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Recent Orders',
                      style: AppTextStyles.h3(cs.ink),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),

            // Recent orders list
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                child: Column(
                  children: [
                    for (final order in sampleOrders)
                      _RecentOrderRow(
                        order: order,
                        statusMap: orderStatusMap,
                        onTap: () => onNav?.call('order:${order.code}'),
                      ),
                  ],
                ),
              ),
            ),

            // View all orders button
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.pad,
                  12,
                  AppSpacing.pad,
                  AppSpacing.pad * 2,
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: RbButton(
                    label: 'View all orders',
                    variant: RbButtonVariant.outline,
                    onPressed: () => onNav?.call('orders'),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  String _getInitials(String email) {
    if (email.isEmpty) return 'U';
    final parts = email.split('@').first.split('.');
    if (parts.length > 1) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return email[0].toUpperCase();
  }

  String _formatDate(DateTime date) {
    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }
}

/// Shift status card: shows "SHIFT ACTIVE" if active, else "No active shift" with start button.
class _ShiftStatusCard extends StatelessWidget {
  const _ShiftStatusCard({
    required this.active,
    this.onStartShift,
  });

  final bool active;
  final VoidCallback? onStartShift;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    if (active) {
      return RbCard(
        padding: const EdgeInsets.all(AppSpacing.pad),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: cs.success,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RbChip(
                  label: 'SHIFT ACTIVE',
                  variant: RbChipVariant.success,
                ),
                const SizedBox(height: 6),
                Text(
                  'Started at 09:30 AM',
                  style: AppTextStyles.meta(cs.muted),
                ),
              ],
            ),
          ],
        ),
      );
    }

    return RbCard(
      padding: const EdgeInsets.all(AppSpacing.pad),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          RbChip(
            label: 'No active shift',
            variant: RbChipVariant.neutral,
          ),
          SizedBox(
            height: AppSpacing.btnHSm,
            child: RbButton(
              label: 'Start',
              size: RbButtonSize.regular,
              onPressed: onStartShift,
            ),
          ),
        ],
      ),
    );
  }
}

/// Stats row showing 3 metric cards
class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});

  final List<(String value, String label)> stats;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Row(
      children: stats
          .asMap()
          .entries
          .map(
            (entry) => Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  right: entry.key < stats.length - 1 ? AppSpacing.padSm : 0,
                ),
                child: RbCard(
                  padding: const EdgeInsets.all(AppSpacing.pad),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.value.$1,
                        style: AppTextStyles.money(
                          cs.ink,
                          size: 20,
                          weight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        entry.value.$2,
                        style: AppTextStyles.meta(cs.muted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

/// Invoices summary card: total due, overdue count, "View all" button
class _InvoicesSummary extends StatelessWidget {
  const _InvoicesSummary({
    required this.totalDue,
    required this.overdueCount,
    this.onViewAll,
  });

  final double totalDue;
  final int overdueCount;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return RbCard(
      padding: const EdgeInsets.all(AppSpacing.pad),
      onTap: onViewAll,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'My Invoices',
            style: AppTextStyles.h3(cs.ink),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Total Due',
                    style: AppTextStyles.meta(cs.muted),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    MoneyFormatter.format(totalDue),
                    style: AppTextStyles.money(
                      cs.ink,
                      size: 24,
                      weight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (overdueCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: cs.dangerSoft,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                  ),
                  child: Text(
                    '$overdueCount overdue',
                    style: AppTextStyles.meta(cs.danger),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              'View all →',
              style: AppTextStyles.body(cs.accent),
            ),
          ),
        ],
      ),
    );
  }
}

/// Recent order row: order code, status chip, amount
class _RecentOrderRow extends StatelessWidget {
  const _RecentOrderRow({
    required this.order,
    required this.statusMap,
    this.onTap,
  });

  final _SampleOrder order;
  final Map<String, (String, Color, Color)> statusMap;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final statusInfo = statusMap[order.status];

    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.padSm),
        child: RbCard(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.code,
                      style: AppTextStyles.h3(cs.ink),
                    ),
                    const SizedBox(height: 4),
                    if (statusInfo != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: statusInfo.$3,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                        ),
                        child: Text(
                          statusInfo.$1,
                          style: AppTextStyles.meta(statusInfo.$2),
                        ),
                      ),
                  ],
                ),
              ),
              Text(
                MoneyFormatter.format(order.amount),
                style: AppTextStyles.money(
                  cs.ink,
                  size: 16,
                  weight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Extension for string capitalization
extension StringCapitalization on String {
  String capitalize() {
    if (isEmpty) return this;
    return this[0].toUpperCase() + substring(1);
  }
}
