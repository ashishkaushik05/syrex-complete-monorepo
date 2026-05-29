import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/rb_components.dart';
import '../models/field_models.dart';
import '../repository/field_repository.dart';

final _shiftHistoryProvider =
    FutureProvider.autoDispose<List<ShiftModel>>((ref) async {
  return ref.read(fieldRepositoryProvider).shiftsForDate();
});

class ShiftHistoryPage extends ConsumerWidget {
  const ShiftHistoryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_shiftHistoryProvider);
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          RbTopBar(
            title: 'Shift history',
            leading: IconButton(
              icon: Icon(Icons.arrow_back, size: 20, color: c.ink),
              onPressed: () => context.pop(),
            ),
            sub: 'Last 5 days',
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: RbColors.accent)),
              error: (e, _) => RbEmpty(
                  icon: Icons.history_outlined,
                  title: 'Could not load history'),
              data: (shifts) {
                if (shifts.isEmpty) {
                  return const RbEmpty(
                    icon: Icons.history_outlined,
                    title: 'No shifts found',
                    sub: 'Your completed shifts will appear here.',
                  );
                }
                final totalMinutes = shifts.fold<int>(0, (s, sh) {
                  final dur = _shiftDurationMinutes(sh);
                  return s + dur;
                });
                final totalHours = totalMinutes / 60.0;

                return RefreshIndicator(
                  color: RbColors.accent,
                  onRefresh: () async => ref.invalidate(_shiftHistoryProvider),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                    children: [
                      const SizedBox(height: 8),
                      // Aggregate card
                      RbCard(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              Expanded(
                                child: _AggregateTile(
                                  label: 'Hours',
                                  value: totalHours.toStringAsFixed(1),
                                ),
                              ),
                              Expanded(
                                child: _AggregateTile(
                                  label: 'Shifts',
                                  value: '${shifts.length}',
                                ),
                              ),
                              Expanded(
                                child: _AggregateTile(
                                  label: 'Active',
                                  value: '${shifts.where((s) => s.isActive).length}',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Bar chart
                      if (shifts.isNotEmpty) ...[
                        RbSection(label: 'Hours by shift'),
                        const SizedBox(height: 8),
                        RbCard(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: _BarChart(shifts: shifts.take(5).toList()),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      RbSection(label: 'All shifts'),
                      const SizedBox(height: 8),
                      RbCard(
                        child: Column(
                          children: [
                            for (int i = 0; i < shifts.length; i++)
                              _ShiftRow(shift: shifts[i], isFirst: i == 0),
                          ],
                        ),
                      ),
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

  static int _shiftDurationMinutes(ShiftModel shift) {
    final start = DateTime.tryParse(shift.startedAt);
    if (start == null) return 0;
    final end = shift.endedAt != null
        ? DateTime.tryParse(shift.endedAt!) ?? DateTime.now()
        : DateTime.now();
    return end.difference(start).inMinutes;
  }
}

class _AggregateTile extends StatelessWidget {
  const _AggregateTile({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Column(
      children: [
        Text(value,
            style: GoogleFonts.inter(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: c.ink,
                fontFeatures: const [FontFeature.tabularFigures()])),
        Text(label,
            style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
      ],
    );
  }
}

class _BarChart extends StatelessWidget {
  const _BarChart({required this.shifts});
  final List<ShiftModel> shifts;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final maxMinutes = shifts.fold<int>(0, (max, s) {
      final m = _mins(s);
      return m > max ? m : max;
    });

    return SizedBox(
      height: 80,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: shifts.map((shift) {
          final mins = _mins(shift);
          final pct = maxMinutes > 0 ? mins / maxMinutes : 0.0;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    '${(mins / 60).toStringAsFixed(1)}h',
                    style: GoogleFonts.inter(fontSize: 10, color: c.muted),
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: FractionallySizedBox(
                      heightFactor: pct.clamp(0.04, 1.0),
                      child: Container(
                        color: shift.isActive ? RbColors.accent : c.surface3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  static int _mins(ShiftModel shift) {
    final start = DateTime.tryParse(shift.startedAt);
    if (start == null) return 0;
    final end = shift.endedAt != null
        ? DateTime.tryParse(shift.endedAt!) ?? DateTime.now()
        : DateTime.now();
    return end.difference(start).inMinutes;
  }
}

class _ShiftRow extends StatelessWidget {
  const _ShiftRow({required this.shift, required this.isFirst});
  final ShiftModel shift;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final start = DateTime.tryParse(shift.startedAt)?.toLocal();
    final end = shift.endedAt != null
        ? DateTime.tryParse(shift.endedAt!)?.toLocal()
        : null;
    final dur = _duration(shift);

    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          SizedBox(
            width: 60,
            child: Text(
              start != null ? _fmtDate(start) : '—',
              style: GoogleFonts.inter(fontSize: 12, color: c.muted),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_fmtTime(start)} → ${end != null ? _fmtTime(end) : 'Now'}',
                  style: GoogleFonts.inter(fontSize: 13, color: c.ink),
                ),
                Text(dur,
                    style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
              ],
            ),
          ),
          if (shift.isActive) RbChip(label: 'Active', tone: RbTone.success),
        ],
      ),
    );
  }

  static String _fmtDate(DateTime dt) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[dt.month - 1]} ${dt.day}';
  }

  static String _fmtTime(DateTime? dt) {
    if (dt == null) return '—';
    final h = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m ${dt.hour >= 12 ? 'PM' : 'AM'}';
  }

  static String _duration(ShiftModel shift) {
    final start = DateTime.tryParse(shift.startedAt);
    if (start == null) return '—';
    final end = shift.endedAt != null
        ? DateTime.tryParse(shift.endedAt!) ?? DateTime.now()
        : DateTime.now();
    final diff = end.difference(start);
    final h = diff.inHours;
    final m = diff.inMinutes % 60;
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }
}
