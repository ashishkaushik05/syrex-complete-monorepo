import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/money_formatter.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_status_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/api/outlet_portal_client.dart';
import 'package:outlet_owner_template/core/providers/invoice_providers.dart';

class InvoiceHistoryScreen extends ConsumerStatefulWidget {
  final void Function(String route)? onNav;

  const InvoiceHistoryScreen({
    super.key,
    this.onNav,
  });

  @override
  ConsumerState<InvoiceHistoryScreen> createState() => _InvoiceHistoryScreenState();
}

class _InvoiceHistoryScreenState extends ConsumerState<InvoiceHistoryScreen> {
  String _selectedFilter = 'all';

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

  String _getInvoiceStatus(InvoiceListItem invoice) {
    // Determine status based on payment and due date
    final now = DateTime.now();
    final dueDate = invoice.dueDate != null ? DateTime.tryParse(invoice.dueDate!) : null;
    final amountDueNum = double.tryParse(invoice.amountDue) ?? 0;
    final totalNum = double.tryParse(invoice.total) ?? 1;

    if (amountDueNum <= 0) {
      return 'paid';
    }

    if (dueDate != null && now.isAfter(dueDate)) {
      return 'overdue';
    }

    if (amountDueNum < totalNum) {
      return 'partial';
    }

    return 'open';
  }

  List<InvoiceListItem> _getFilteredInvoices(List<InvoiceListItem> invoices) {
    switch (_selectedFilter) {
      case 'overdue':
        return invoices.where((inv) => _getInvoiceStatus(inv) == 'overdue').toList();
      case 'partial':
        return invoices.where((inv) => _getInvoiceStatus(inv) == 'partial').toList();
      case 'open':
        return invoices.where((inv) => _getInvoiceStatus(inv) == 'open').toList();
      case 'paid':
        return invoices.where((inv) => _getInvoiceStatus(inv) == 'paid').toList();
      default:
        return invoices;
    }
  }

  num _getTotalAmountDue(List<InvoiceListItem> invoices) {
    return invoices.fold<num>(0, (sum, inv) {
      final amountDue = double.tryParse(inv.amountDue) ?? 0;
      return sum + amountDue;
    });
  }

  int _getOverdueCount(List<InvoiceListItem> invoices) {
    return invoices.where((inv) => _getInvoiceStatus(inv) == 'overdue').length;
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final invoiceListAsync = ref.watch(invoiceListProvider);

    return Scaffold(
      backgroundColor: cs.bg,
      body: Column(
        children: [
          // Top bar
          RbTopBar(
            title: 'Invoices',
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
                    child: RbIcon('filter', size: 18, color: cs.ink),
                  ),
                ),
              ),
            ],
          ),
          // Expanded content
          Expanded(
            child: invoiceListAsync.when(
              loading: () => _buildLoadingContent(cs),
              error: (err, stack) => _buildErrorContent(cs, err),
              data: (invoices) {
                final filteredInvoices = _getFilteredInvoices(invoices);
                final totalDue = _getTotalAmountDue(invoices);
                final overdueCount = _getOverdueCount(invoices);

                return SingleChildScrollView(
                  child: Column(
                    children: [
                      const SizedBox(height: 12),
                      // Dark hero card
                      _buildHeroCard(cs, totalDue, overdueCount),
                      const SizedBox(height: 20),
                      // Filter chips
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              _buildFilterChip('all', 'All'),
                              const SizedBox(width: 8),
                              _buildFilterChip('overdue', 'Overdue'),
                              const SizedBox(width: 8),
                              _buildFilterChip('partial', 'Partial'),
                              const SizedBox(width: 8),
                              _buildFilterChip('open', 'Open'),
                              const SizedBox(width: 8),
                              _buildFilterChip('paid', 'Paid'),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Invoice list
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
                        child: Column(
                          children: [
                            if (filteredInvoices.isEmpty)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 32),
                                child: Text(
                                  'No invoices found',
                                  style: TextStyle(
                                    fontFamily: 'Geist',
                                    fontSize: 14,
                                    color: cs.muted,
                                  ),
                                ),
                              )
                            else
                              for (final invoice in filteredInvoices) ...[
                                _buildInvoiceCard(invoice, cs),
                                const SizedBox(height: 12),
                              ]
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingContent(AppColorScheme cs) {
    return SingleChildScrollView(
      child: Column(
        children: [
          const SizedBox(height: 12),
          // Shimmer placeholder for hero card
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
            child: RbCard(
              padding: const EdgeInsets.all(16),
              child: Container(
                decoration: BoxDecoration(
                  color: cs.surface2,
                  borderRadius: BorderRadius.circular(AppSpacing.radius),
                ),
                height: 150,
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
              'Failed to load invoices',
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

  Widget _buildHeroCard(AppColorScheme cs, num totalDue, int overdueCount) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.pad),
      child: RbCard(
        padding: const EdgeInsets.all(16),
        child: Container(
          decoration: BoxDecoration(
            color: cs.ink,
            borderRadius: BorderRadius.circular(AppSpacing.radius),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Label
              Text(
                'Total amount due'.toUpperCase(),
                style: TextStyle(
                  fontFamily: 'Geist',
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: cs.bg.withAlpha((255 * 0.6).toInt()),
                  letterSpacing: 0.06,
                ),
              ),
              const SizedBox(height: 8),
              // Amount
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Expanded(
                    child: Text(
                      MoneyFormatter.format(totalDue, compact: true),
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 30,
                        fontWeight: FontWeight.w700,
                        color: cs.bg,
                        letterSpacing: -0.65,
                      ),
                    ),
                  ),
                  if (overdueCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: cs.danger,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                      ),
                      child: Text(
                        '$overdueCount overdue',
                        style: TextStyle(
                          fontFamily: 'Geist',
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              // Pay button
              SizedBox(
                width: double.infinity,
                height: AppSpacing.btnH,
                child: Material(
                  color: Colors.white.withAlpha(30),
                  borderRadius: BorderRadius.circular(8),
                  child: InkWell(
                    onTap: () {},
                    borderRadius: BorderRadius.circular(8),
                    child: Center(
                      child: Text(
                        'Pay outstanding',
                        style: TextStyle(
                          fontFamily: 'Geist',
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: cs.bg,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedFilter = value;
        });
      },
      child: RbChip(
        label: label,
        variant: _selectedFilter == value
            ? RbChipVariant.accent
            : RbChipVariant.neutral,
      ),
    );
  }

  Widget _buildInvoiceCard(InvoiceListItem invoice, AppColorScheme cs) {
    final status = _getInvoiceStatus(invoice);
    final totalNum = double.tryParse(invoice.total) ?? 0;
    final paidNum = double.tryParse(invoice.amountPaid) ?? 0;
    final pct = totalNum > 0 ? ((paidNum / totalNum) * 100).toInt() : 0;

    // Format date - invoice dates are ISO strings
    final invoiceDate = DateTime.tryParse(invoice.invoiceDate);
    final formattedDate = invoiceDate != null
        ? '${invoiceDate.day} ${_monthName(invoiceDate.month)} ${invoiceDate.year}'
        : invoice.invoiceDate;

    // Format due date if exists
    final dueDate = invoice.dueDate != null ? DateTime.tryParse(invoice.dueDate!) : null;
    final formattedDueDate = dueDate != null
        ? '${dueDate.day} ${_monthName(dueDate.month)} ${dueDate.year}'
        : 'N/A';

    return GestureDetector(
      onTap: widget.onNav != null
          ? () {
              widget.onNav!('invoice/${invoice.id}');
            }
          : null,
      child: RbCard(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row: code + status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  invoice.invoiceNumber,
                  style: TextStyle(
                    fontFamily: 'Geist',
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: cs.ink,
                  ),
                ),
                RbStatusChip(
                  status: status,
                  statusMap: _statusMap,
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Meta row: date
            Text(
              formattedDate,
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 12,
                color: cs.muted,
              ),
            ),
            const SizedBox(height: 8),
            // Amount row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Amount due',
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 11,
                        color: cs.muted2,
                      ),
                    ),
                    Text(
                      MoneyFormatter.format(double.tryParse(invoice.amountDue) ?? 0),
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: cs.ink,
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Total',
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 11,
                        color: cs.muted2,
                      ),
                    ),
                    Text(
                      MoneyFormatter.format(totalNum),
                      style: TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: cs.ink,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Due date
            Text(
              'Due: $formattedDueDate',
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 11,
                color: cs.muted,
              ),
            ),
            const SizedBox(height: 10),
            // Progress bar
            ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.radiusXs),
              child: LinearProgressIndicator(
                value: pct / 100,
                minHeight: 4,
                backgroundColor: cs.surface2,
                valueColor: AlwaysStoppedAnimation<Color>(cs.accent),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _monthName(int month) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return months[month - 1];
  }
}
