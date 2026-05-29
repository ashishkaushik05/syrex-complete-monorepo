import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/money_formatter.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_status_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/api/outlet_portal_client.dart';
import 'package:outlet_owner_template/core/providers/invoice_providers.dart';

class InvoiceDetailScreen extends ConsumerWidget {
  final String invoiceId;
  final VoidCallback? onBack;
  final void Function(String route)? onNav;

  const InvoiceDetailScreen({
    super.key,
    required this.invoiceId,
    this.onBack,
    this.onNav,
  });

  Map<String, RbStatusMeta> get _statusMap => {
    'overdue': RbStatusMeta(
      label: 'Overdue',
      color: const Color(0xFFEF4444),
      bgColor: const Color(0xFFFFE4E6),
    ),
    'partial': RbStatusMeta(
      label: 'Partial',
      color: const Color(0xFFF59E0B),
      bgColor: const Color(0xFFFEF3C7),
    ),
    'open': RbStatusMeta(
      label: 'Open',
      color: const Color(0xFF3F3F46),
      bgColor: const Color(0xFFF3F3F1),
    ),
    'paid': RbStatusMeta(
      label: 'Paid',
      color: const Color(0xFF10B981),
      bgColor: const Color(0xFFECFDF5),
    ),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final invoiceDetailAsync = ref.watch(invoiceDetailProvider(invoiceId));

    return Scaffold(
      backgroundColor: cs.bg,
      body: Column(
        children: [
          // Top bar with back button
          RbTopBar(
            leading: GestureDetector(
              onTap: onBack,
              child: RbIcon('chev-left', size: 24, color: cs.ink),
            ),
            titleWidget: invoiceDetailAsync.maybeWhen(
              data: (invoice) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    invoice.invoiceNumber,
                    style: TextStyle(
                      fontFamily: 'Geist',
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                      color: cs.ink,
                      letterSpacing: -0.65,
                    ),
                  ),
                  Text(
                    invoice.invoiceDate,
                    style: TextStyle(
                      fontFamily: 'Geist',
                      fontSize: 13,
                      color: cs.ink2,
                    ),
                  ),
                ],
              ),
              orElse: () => Text(
                'Loading...',
                style: TextStyle(
                  fontFamily: 'Geist',
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: cs.ink,
                ),
              ),
            ),
            actions: [
              GestureDetector(
                onTap: () {},
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: cs.surface2,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  child: Center(
                    child: RbIcon('doc', size: 18, color: cs.ink),
                  ),
                ),
              ),
            ],
          ),
          // Expanded scrollable content
          Expanded(
            child: invoiceDetailAsync.when(
              loading: () => _buildLoadingContent(cs),
              error: (err, stack) => _buildErrorContent(cs, err),
              data: (invoice) => SingleChildScrollView(
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    // Amount hero card
                    _buildAmountCard(invoice, cs),
                    const SizedBox(height: 20),
                    // Line items section
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Line Items',
                            style: TextStyle(
                              fontFamily: 'Geist',
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: cs.ink,
                            ),
                          ),
                          const SizedBox(height: 12),
                          for (final item in invoice.lines) ...[
                            _buildLineItemRow(item, cs),
                            const SizedBox(height: 10),
                          ]
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Breakdown section
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                      child: RbCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          children: [
                            _buildBreakdownRow(
                              'Subtotal',
                              double.tryParse(invoice.subtotal) ?? 0,
                              cs,
                            ),
                            const SizedBox(height: 8),
                            if ((double.tryParse(invoice.discountAmount) ?? 0) > 0) ...[
                              _buildBreakdownRow(
                                'Discount',
                                -(double.tryParse(invoice.discountAmount) ?? 0),
                                cs,
                                isNegative: true,
                              ),
                              const SizedBox(height: 8),
                            ],
                            for (final charge in invoice.charges) ...[
                              _buildBreakdownRow(
                                charge.name,
                                double.tryParse(charge.amount) ?? 0,
                                cs,
                              ),
                              const SizedBox(height: 8),
                            ],
                            const Divider(height: 16),
                            _buildBreakdownRow(
                              'Total',
                              double.tryParse(invoice.total) ?? 0,
                              cs,
                              isBold: true,
                            ),
                            const SizedBox(height: 12),
                            _buildBreakdownRow(
                              'Amount Paid',
                              double.tryParse(invoice.amountPaid) ?? 0,
                              cs,
                              color: cs.accent,
                            ),
                            const SizedBox(height: 8),
                            _buildBreakdownRow(
                              'Amount Due',
                              double.tryParse(invoice.amountDue) ?? 0,
                              cs,
                              color: (double.tryParse(invoice.amountDue) ?? 0) > 0
                                  ? cs.danger
                                  : cs.accent,
                              isBold: true,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 100), // Space for sticky bottom bar
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      // Sticky bottom bar
      bottomSheet: invoiceDetailAsync.maybeWhen(
        data: (invoice) {
          final amountDue = double.tryParse(invoice.amountDue) ?? 0;
          return amountDue > 0 ? _buildStickyBottomBar(invoice, cs) : null;
        },
        orElse: () => null,
      ),
    );
  }

  Widget _buildLoadingContent(AppColorScheme cs) {
    return SingleChildScrollView(
      child: Column(
        children: [
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
            child: RbCard(
              padding: const EdgeInsets.all(16),
              child: Container(
                decoration: BoxDecoration(
                  color: cs.surface2,
                  borderRadius: BorderRadius.circular(AppSpacing.radius),
                ),
                height: 200,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Center(
            child: CircularProgressIndicator(
              color: cs.accent,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorContent(AppColorScheme cs, Object error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.pad),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Failed to load invoice',
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: cs.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              error.toString(),
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 12,
                color: cs.muted,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAmountCard(
    InvoiceDetail invoice,
    AppColorScheme cs,
  ) {
    final totalNum = double.tryParse(invoice.total) ?? 0;
    final paidNum = double.tryParse(invoice.amountPaid) ?? 0;
    final dueNum = double.tryParse(invoice.amountDue) ?? 0;
    final pct =
        totalNum > 0 ? ((paidNum / totalNum) * 100).toInt() : 0;
    final amountDueColor = dueNum > 0 ? cs.danger : cs.accent;

    // Determine status
    String status = 'open';
    if (dueNum <= 0) {
      status = 'paid';
    } else {
      final dueDate = invoice.dueDate != null
          ? DateTime.tryParse(invoice.dueDate!)
          : null;
      if (dueDate != null && DateTime.now().isAfter(dueDate)) {
        status = 'overdue';
      } else if (dueNum < totalNum) {
        status = 'partial';
      }
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
      child: RbCard(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Amount due'.toUpperCase(),
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: cs.muted2,
                        letterSpacing: 0.06,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      MoneyFormatter.format(dueNum),
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        color: amountDueColor,
                        letterSpacing: -0.65,
                      ),
                    ),
                  ],
                ),
                RbStatusChip(
                  status: status,
                  statusMap: _statusMap,
                ),
              ],
            ),
            if (dueNum > 0 && invoice.dueDate != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'by ${invoice.dueDate}',
                  style: TextStyle(
                    fontFamily: 'Geist',
                    fontSize: 12,
                    color: cs.muted,
                  ),
                ),
              ),
            const SizedBox(height: 16),
            // Progress bar
            ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
              child: LinearProgressIndicator(
                value: pct / 100,
                minHeight: 8,
                backgroundColor: cs.surface2,
                valueColor: AlwaysStoppedAnimation<Color>(cs.accent),
              ),
            ),
            const SizedBox(height: 8),
            // Progress text
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Paid ${MoneyFormatter.format(paidNum)}',
                  style: TextStyle(
                    fontFamily: 'Geist',
                    fontSize: 11,
                    color: cs.muted,
                  ),
                ),
                Text(
                  '$pct%',
                  style: TextStyle(
                    fontFamily: 'Geist',
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: cs.ink2,
                  ),
                ),
                Text(
                  'Total ${MoneyFormatter.format(totalNum)}',
                  style: TextStyle(
                    fontFamily: 'Geist',
                    fontSize: 11,
                    color: cs.muted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // Link to order
            GestureDetector(
              onTap: onNav != null
                  ? () {
                      onNav!('order/${invoice.orderId}');
                    }
                  : null,
              child: Row(
                children: [
                  Text(
                    'Order ${invoice.orderNumber}',
                    style: TextStyle(
                      fontFamily: 'Geist',
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: cs.accent,
                    ),
                  ),
                  const SizedBox(width: 4),
                  RbIcon('arrow-up-right', size: 14, color: cs.accent),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLineItemRow(
    InvoiceLineItem item,
    AppColorScheme cs,
  ) {
    final unitPrice = double.tryParse(item.unitPrice) ?? 0;
    final lineTotal = double.tryParse(item.lineTotal) ?? 0;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.sku,
                style: TextStyle(
                  fontFamily: 'Geist',
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: cs.ink,
                ),
              ),
              Text(
                'Qty: ${item.qty} × ${MoneyFormatter.format(unitPrice)}',
                style: TextStyle(
                  fontFamily: 'Geist',
                  fontSize: 11,
                  color: cs.muted,
                ),
              ),
            ],
          ),
        ),
        Text(
          MoneyFormatter.format(lineTotal),
          style: TextStyle(
            fontFamily: 'Geist',
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: cs.ink,
          ),
        ),
      ],
    );
  }

  Widget _buildBreakdownRow(
    String label,
    num amount,
    AppColorScheme cs, {
    bool isBold = false,
    bool isNegative = false,
    Color? color,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontFamily: 'Geist',
            fontSize: isBold ? 13 : 12,
            fontWeight: isBold ? FontWeight.w600 : FontWeight.w500,
            color: color ?? cs.ink2,
          ),
        ),
        Text(
          (isNegative ? '−' : '') + MoneyFormatter.format(amount.abs()),
          style: TextStyle(
            fontFamily: 'Geist',
            fontSize: isBold ? 13 : 12,
            fontWeight: isBold ? FontWeight.w600 : FontWeight.w500,
            color: color ?? cs.ink,
          ),
        ),
      ],
    );
  }

  Widget _buildStickyBottomBar(
    InvoiceDetail invoice,
    AppColorScheme cs,
  ) {
    final amountDue = double.tryParse(invoice.amountDue) ?? 0;

    return Positioned(
      left: 0,
      right: 0,
      bottom: AppSpacing.tabBarBottomPad,
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            decoration: BoxDecoration(
              color: cs.bg.withAlpha(230),
              border: Border(
                top: BorderSide(color: cs.line, width: AppSpacing.hairline),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Row(
              children: [
                Expanded(
                  child: RbButton(
                    label: 'Download',
                    variant: RbButtonVariant.outline,
                    leading: RbIcon('doc', size: 14),
                    onPressed: () {},
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: RbButton(
                    label: 'Pay ${MoneyFormatter.format(amountDue)}',
                    variant: RbButtonVariant.primary,
                    leading: RbIcon('wallet', size: 14),
                    onPressed: () {},
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
