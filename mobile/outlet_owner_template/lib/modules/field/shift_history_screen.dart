import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';

class ShiftHistoryScreen extends ConsumerWidget {
  final VoidCallback? onBack;

  const ShiftHistoryScreen({
    super.key,
    this.onBack,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Scaffold(
      body: Column(
        children: [
          RbTopBar(
            title: 'Shift history',
            leading: onBack != null
                ? GestureDetector(
                    onTap: onBack,
                    child:
                        RbIcon('chev-left', size: AppSpacing.iconLg, color: cs.ink),
                  )
                : null,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.pad,
                AppSpacing.pad,
                AppSpacing.pad,
                120,
              ),
              children: [
                // Summary stats card
                RbCard(
                  padding: const EdgeInsets.all(AppSpacing.padLg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Summary',
                        style: GoogleFonts.geist(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: cs.ink2,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _SummaryItem(
                            label: 'Total shifts',
                            value: '23',
                            cs: cs,
                          ),
                          _SummaryItem(
                            label: 'Total hours',
                            value: '156 h',
                            cs: cs,
                          ),
                          _SummaryItem(
                            label: 'Avg shift',
                            value: '6.8 h',
                            cs: cs,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Past shifts
                Text(
                  'Past 7 days',
                  style: GoogleFonts.geist(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: cs.ink,
                  ),
                ),
                const SizedBox(height: 12),
                _ShiftHistoryList(cs: cs),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryItem extends StatelessWidget {
  final String label;
  final String value;
  final AppColorScheme cs;

  const _SummaryItem({
    required this.label,
    required this.value,
    required this.cs,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: GoogleFonts.geist(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: cs.ink,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: GoogleFonts.geist(
            fontSize: 11,
            color: cs.muted,
          ),
        ),
      ],
    );
  }
}

class _ShiftHistoryList extends StatelessWidget {
  final AppColorScheme cs;

  const _ShiftHistoryList({required this.cs});

  @override
  Widget build(BuildContext context) {
    final shifts = [
      {
        'date': 'May 24, 2026',
        'dayOfWeek': 'Saturday',
        'startTime': '8:00 AM',
        'endTime': '4:30 PM',
        'duration': '8h 30m',
        'visits': 5,
        'status': 'completed',
      },
      {
        'date': 'May 23, 2026',
        'dayOfWeek': 'Friday',
        'startTime': '8:15 AM',
        'endTime': '4:45 PM',
        'duration': '8h 30m',
        'visits': 4,
        'status': 'completed',
      },
      {
        'date': 'May 22, 2026',
        'dayOfWeek': 'Thursday',
        'startTime': '8:00 AM',
        'endTime': '3:15 PM',
        'duration': '7h 15m',
        'visits': 3,
        'status': 'completed',
      },
      {
        'date': 'May 21, 2026',
        'dayOfWeek': 'Wednesday',
        'startTime': '8:30 AM',
        'endTime': '5:00 PM',
        'duration': '8h 30m',
        'visits': 6,
        'status': 'completed',
      },
      {
        'date': 'May 20, 2026',
        'dayOfWeek': 'Tuesday',
        'startTime': '8:00 AM',
        'endTime': 'N/A',
        'duration': '4h 15m',
        'visits': 2,
        'status': 'incomplete',
      },
      {
        'date': 'May 19, 2026',
        'dayOfWeek': 'Monday',
        'startTime': '8:00 AM',
        'endTime': '4:30 PM',
        'duration': '8h 30m',
        'visits': 5,
        'status': 'completed',
      },
      {
        'date': 'May 18, 2026',
        'dayOfWeek': 'Sunday',
        'startTime': '9:00 AM',
        'endTime': '3:00 PM',
        'duration': '6h 0m',
        'visits': 3,
        'status': 'completed',
      },
    ];

    if (shifts.isEmpty) {
      return Center(
        child: Text(
          'No shift history',
          style: GoogleFonts.geist(
            fontSize: 14,
            color: cs.muted,
          ),
        ),
      );
    }

    return Column(
      children: shifts.map((shift) {
        final isCompleted = shift['status'] == 'completed';

        return Column(
          children: [
            RbCard(
              padding: const EdgeInsets.all(AppSpacing.pad),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            shift['date']!,
                            style: GoogleFonts.geist(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: cs.ink,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            shift['dayOfWeek']!,
                            style: GoogleFonts.geist(
                              fontSize: 12,
                              color: cs.ink2,
                            ),
                          ),
                        ],
                      ),
                      RbChip(
                        label: isCompleted ? 'Completed' : 'Incomplete',
                        variant: isCompleted
                            ? RbChipVariant.success
                            : RbChipVariant.neutral,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _ShiftDetail(
                        label: 'Start time',
                        value: shift['startTime']!,
                        cs: cs,
                      ),
                      _ShiftDetail(
                        label: 'End time',
                        value: shift['endTime']!,
                        cs: cs,
                      ),
                      _ShiftDetail(
                        label: 'Duration',
                        value: shift['duration']!,
                        cs: cs,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Visits: ${shift['visits']}',
                        style: GoogleFonts.geist(
                          fontSize: 12,
                          color: cs.ink2,
                        ),
                      ),
                      RbChip(
                        label: '${shift['visits']} visits',
                        variant: RbChipVariant.neutral,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        );
      }).toList(),
    );
  }
}

class _ShiftDetail extends StatelessWidget {
  final String label;
  final String value;
  final AppColorScheme cs;

  const _ShiftDetail({
    required this.label,
    required this.value,
    required this.cs,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.geist(
            fontSize: 10,
            color: cs.muted,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: GoogleFonts.geist(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: cs.ink,
          ),
        ),
      ],
    );
  }
}
