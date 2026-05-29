import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/api/field_client.dart';

class FieldHomeScreen extends ConsumerWidget {
  final void Function(String)? onNav;

  const FieldHomeScreen({
    super.key,
    this.onNav,
  });

  String _formatElapsedTime(DateTime startTime) {
    final now = DateTime.now();
    final diff = now.difference(startTime);
    final hours = diff.inHours;
    final minutes = diff.inMinutes % 60;
    return '${hours}h ${minutes}m';
  }

  String _formatStartTime(DateTime startTime) {
    return '${startTime.hour.toString().padLeft(2, '0')}:${startTime.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final activeShiftAsync = ref.watch(activeShiftProvider);
    final fieldClient = ref.watch(fieldClientProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.pad,
        AppSpacing.padSm,
        AppSpacing.pad,
        120,
      ),
      children: [
        // Shift control card
        RbCard(
          padding: const EdgeInsets.all(AppSpacing.padLg),
          child: activeShiftAsync.when(
            data: (shift) {
              if (shift != null) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        RbChip(
                          label: 'SHIFT ACTIVE',
                          variant: RbChipVariant.accent,
                        ),
                        const Spacer(),
                        Text(
                          _formatElapsedTime(shift.startTime),
                          style: GoogleFonts.geist(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: cs.ink,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Started at ${_formatStartTime(shift.startTime)}',
                      style: GoogleFonts.geist(
                        fontSize: 13,
                        color: cs.ink2,
                      ),
                    ),
                    const SizedBox(height: 16),
                    RbButton(
                      label: 'End shift',
                      onPressed: () async {
                        try {
                          await fieldClient.endShift(shift.id);
                          ref.invalidate(activeShiftProvider);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Shift ended successfully'),
                                backgroundColor: Colors.green,
                              ),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Error: $e'),
                                backgroundColor: Colors.red,
                              ),
                            );
                          }
                        }
                      },
                      variant: RbButtonVariant.danger,
                      fullWidth: true,
                    ),
                  ],
                );
              } else {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'No active shift',
                      style: GoogleFonts.geist(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: cs.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Start your shift to begin tracking field activity',
                      style: GoogleFonts.geist(
                        fontSize: 13,
                        color: cs.ink2,
                      ),
                    ),
                    const SizedBox(height: 16),
                    RbButton(
                      label: 'Start shift',
                      onPressed: () async {
                        try {
                          await fieldClient.startShift();
                          ref.invalidate(activeShiftProvider);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Shift started successfully'),
                                backgroundColor: Colors.green,
                              ),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Error: $e'),
                                backgroundColor: Colors.red,
                              ),
                            );
                          }
                        }
                      },
                      fullWidth: true,
                    ),
                  ],
                );
              }
            },
            loading: () => Center(
              child: CircularProgressIndicator(color: cs.accent),
            ),
            error: (err, stack) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Error loading shift',
                  style: GoogleFonts.geist(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: cs.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  err.toString(),
                  style: GoogleFonts.geist(
                    fontSize: 13,
                    color: cs.ink2,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Map area placeholder
        Container(
          height: 200,
          decoration: BoxDecoration(
            color: cs.surface2,
            borderRadius: BorderRadius.circular(AppSpacing.radius),
          ),
          child: Center(
            child: Text(
              'Live map',
              style: GoogleFonts.geist(
                fontSize: 14,
                color: cs.muted,
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Today's stats row
        Text(
          "Today's activity",
          style: GoogleFonts.geist(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: cs.ink2,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _StatCard(label: 'Visits', value: '—', cs: cs),
            const SizedBox(width: 8),
            _StatCard(label: 'Stops', value: '—', cs: cs),
            const SizedBox(width: 8),
            _StatCard(label: 'Distance', value: '—', cs: cs),
          ],
        ),
        const SizedBox(height: 20),

        // Quick actions
        Row(
          children: [
            Expanded(
              child: RbButton(
                label: 'Log visit',
                onPressed: onNav != null
                    ? () => onNav!('visit')
                    : null,
                leading: RbIcon('plus', size: AppSpacing.iconSm),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: RbButton(
                label: 'Mark stop',
                onPressed: onNav != null
                    ? () => onNav!('stops')
                    : null,
                variant: RbButtonVariant.outline,
                leading: RbIcon('stop', size: AppSpacing.iconSm),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Recent activity
        Text(
          'Recent visits',
          style: GoogleFonts.geist(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: cs.ink2,
          ),
        ),
        const SizedBox(height: 8),
        _RecentActivityList(
          cs: cs,
          shiftId: activeShiftAsync.when(
            data: (shift) => shift?.id,
            loading: () => null,
            error: (_, __) => null,
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final AppColorScheme cs;

  const _StatCard({
    required this.label,
    required this.value,
    required this.cs,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: RbCard(
        padding: const EdgeInsets.all(AppSpacing.pad),
        child: Column(
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
        ),
      ),
    );
  }
}

class _RecentActivityList extends ConsumerWidget {
  final AppColorScheme cs;
  final String? shiftId;

  const _RecentActivityList({required this.cs, this.shiftId});

  String _formatTime(DateTime dt) {
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (shiftId == null) {
      return Center(
        child: Text(
          'Start a shift to log visits',
          style: GoogleFonts.geist(
            fontSize: 13,
            color: cs.muted,
          ),
        ),
      );
    }

    final visitsAsync = ref.watch(shiftVisitsProvider(shiftId));

    return visitsAsync.when(
      data: (visits) {
        if (visits.isEmpty) {
          return Center(
            child: Text(
              'No visits logged yet',
              style: GoogleFonts.geist(
                fontSize: 13,
                color: cs.muted,
              ),
            ),
          );
        }
        return Column(
          children: visits.map((visit) {
            return Column(
              children: [
                RbCard(
                  padding: const EdgeInsets.all(AppSpacing.pad),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              visit.outletName,
                              style: GoogleFonts.geist(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: cs.ink,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _formatTime(visit.createdAt),
                              style: GoogleFonts.geist(
                                fontSize: 12,
                                color: cs.ink2,
                              ),
                            ),
                          ],
                        ),
                      ),
                      RbIcon('chev-right',
                          size: AppSpacing.iconMd, color: cs.muted),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            );
          }).toList(),
        );
      },
      loading: () => Center(
        child: CircularProgressIndicator(color: cs.accent),
      ),
      error: (err, stack) => Center(
        child: Text(
          'Error loading visits',
          style: GoogleFonts.geist(
            fontSize: 13,
            color: cs.muted,
          ),
        ),
      ),
    );
  }
}
