import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';
import 'package:outlet_owner_template/core/api/field_client.dart';

class StopScreen extends ConsumerWidget {
  final VoidCallback? onBack;

  const StopScreen({
    super.key,
    this.onBack,
  });

  final _stopReasons = const ['Break', 'Lunch', 'Traffic', 'Other'];

  String _formatElapsedTime(DateTime startTime) {
    final now = DateTime.now();
    final diff = now.difference(startTime);
    final hours = diff.inHours;
    final minutes = diff.inMinutes % 60;
    if (hours > 0) {
      return '${hours}h ${minutes}m';
    }
    return '${minutes}m';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final activeStopAsync = ref.watch(activeStopProvider);
    final fieldClient = ref.watch(fieldClientProvider);

    return Scaffold(
      body: Column(
        children: [
          RbTopBar(
            title: 'Stops',
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
                // Active stop card
                activeStopAsync.when(
                  data: (stop) {
                    if (stop != null) {
                      return Column(
                        children: [
                          RbCard(
                            padding: const EdgeInsets.all(AppSpacing.padLg),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Active stop',
                                          style: GoogleFonts.geist(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: cs.ink2,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          stop.reason,
                                          style: GoogleFonts.geist(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w700,
                                            color: cs.ink,
                                          ),
                                        ),
                                      ],
                                    ),
                                    RbChip(
                                      label: _formatElapsedTime(stop.startTime),
                                      variant: RbChipVariant.accent,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                RbButton(
                                  label: 'End stop',
                                  onPressed: () async {
                                    try {
                                      await fieldClient.endStop(stop.id);
                                      ref.invalidate(activeStopProvider);
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                                'Stop ended successfully'),
                                            backgroundColor: Colors.green,
                                          ),
                                        );
                                      }
                                    } catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(
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
                            ),
                          ),
                          const SizedBox(height: 24),
                        ],
                      );
                    } else {
                      return _MarkStopWidget(
                        stopReasons: _stopReasons,
                        cs: cs,
                        fieldClient: fieldClient,
                        ref: ref,
                        context: context,
                      );
                    }
                  },
                  loading: () => Center(
                    child: CircularProgressIndicator(color: cs.accent),
                  ),
                  error: (err, stack) => _MarkStopWidget(
                    stopReasons: _stopReasons,
                    cs: cs,
                    fieldClient: fieldClient,
                    ref: ref,
                    context: context,
                  ),
                ),

                // Past stops
                Text(
                  'Past stops',
                  style: GoogleFonts.geist(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: cs.ink,
                  ),
                ),
                const SizedBox(height: 12),
                _PastStopsList(cs: cs),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MarkStopWidget extends ConsumerStatefulWidget {
  final List<String> stopReasons;
  final AppColorScheme cs;
  final FieldClient fieldClient;
  final WidgetRef ref;
  final BuildContext context;

  const _MarkStopWidget({
    required this.stopReasons,
    required this.cs,
    required this.fieldClient,
    required this.ref,
    required this.context,
  });

  @override
  ConsumerState<_MarkStopWidget> createState() => _MarkStopWidgetState();
}

class _MarkStopWidgetState extends ConsumerState<_MarkStopWidget> {
  String? _selectedReason;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'Mark stop',
          style: GoogleFonts.geist(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: widget.cs.ink,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Select a reason for your stop',
          style: GoogleFonts.geist(
            fontSize: 13,
            color: widget.cs.ink2,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: widget.stopReasons.map((reason) {
            final isSelected = _selectedReason == reason;
            return GestureDetector(
              onTap: () {
                setState(() {
                  _selectedReason = isSelected ? null : reason;
                });
              },
              child: RbChip(
                label: reason,
                variant: isSelected
                    ? RbChipVariant.accent
                    : RbChipVariant.neutral,
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        RbButton(
          label: 'Start stop',
          onPressed: _selectedReason != null
              ? () async {
                  try {
                    await widget.fieldClient.startStop(reason: _selectedReason!);
                    widget.ref.invalidate(activeStopProvider);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Stop started successfully'),
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
                }
              : null,
          fullWidth: true,
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _PastStopsList extends StatelessWidget {
  final AppColorScheme cs;

  const _PastStopsList({required this.cs});

  @override
  Widget build(BuildContext context) {
    final stops = [
      {
        'reason': 'Lunch',
        'startTime': '12:00 PM',
        'duration': '45 min',
        'time': '12:00 – 12:45 PM',
      },
      {
        'reason': 'Break',
        'startTime': '10:30 AM',
        'duration': '15 min',
        'time': '10:30 – 10:45 AM',
      },
      {
        'reason': 'Traffic',
        'startTime': '09:15 AM',
        'duration': '8 min',
        'time': '09:15 – 09:23 AM',
      },
    ];

    if (stops.isEmpty) {
      return Center(
        child: Text(
          'No stops yet',
          style: GoogleFonts.geist(
            fontSize: 14,
            color: cs.muted,
          ),
        ),
      );
    }

    return Column(
      children: stops.map((stop) {
        return Column(
          children: [
            RbCard(
              padding: const EdgeInsets.all(AppSpacing.pad),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stop['reason']!,
                          style: GoogleFonts.geist(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: cs.ink,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          stop['time']!,
                          style: GoogleFonts.geist(
                            fontSize: 12,
                            color: cs.ink2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    stop['duration']!,
                    style: GoogleFonts.geist(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: cs.muted,
                    ),
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
