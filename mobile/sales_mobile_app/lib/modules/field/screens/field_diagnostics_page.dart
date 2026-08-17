import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/local/field_local_store.dart';
import '../../../shared/widgets/rb_components.dart';
import '../providers/field_providers.dart';

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/// Loads the most recent events for the active shift (used by diagnostics).
final _recentEventsProvider =
    FutureProvider.autoDispose<List<LocalFieldEvent>>((ref) async {
  final shift =
      ref.watch(fieldShiftControllerProvider).activeShift;
  if (shift == null) return const [];
  final store = ref.read(fieldLocalStoreProvider);
  return store.getRecentEvents(shift.clientShiftId, limit: 10);
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

class FieldDiagnosticsPage extends ConsumerStatefulWidget {
  const FieldDiagnosticsPage({super.key});

  @override
  ConsumerState<FieldDiagnosticsPage> createState() =>
      _FieldDiagnosticsPageState();
}

class _FieldDiagnosticsPageState extends ConsumerState<FieldDiagnosticsPage> {
  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final shiftState = ref.watch(fieldShiftControllerProvider);
    final permState = ref.watch(fieldPermissionCoordinatorProvider);
    final eventsAsync = ref.watch(_recentEventsProvider);

    final shift = shiftState.activeShift;

    return Scaffold(
      backgroundColor: c.bg,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: RbTopBar(
              title: 'Field Diagnostics',
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // ── Active shift ──────────────────────────────────────────
                _SectionLabel(label: 'Active Shift'),
                const SizedBox(height: 8),
                RbCard(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _DiagRow(
                          label: 'Client Shift ID',
                          value: shift?.clientShiftId ?? 'None',
                          mono: true,
                        ),
                        _DiagRow(
                          label: 'Status',
                          value: shift?.status ?? '—',
                        ),
                        _DiagRow(
                          label: 'Server Shift ID',
                          value: shift?.serverShiftId ?? 'Not synced yet',
                          mono: true,
                        ),
                        _DiagRow(
                          label: 'Started At',
                          value: _fmtIso(shift?.startedAt),
                        ),
                        _DiagRow(
                          label: 'Ended At',
                          value: _fmtIso(shift?.endedAt),
                        ),
                        _DiagRow(
                          label: 'Last Error',
                          value: shift?.lastErrorCode ?? '—',
                          isLast: true,
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // ── Queue depth ───────────────────────────────────────────
                _SectionLabel(label: 'Queue Depth'),
                const SizedBox(height: 8),
                RbCard(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'Pending Points',
                              style: GoogleFonts.inter(
                                  fontSize: 13, color: c.muted),
                            ),
                            const Spacer(),
                            Text(
                              '${shiftState.pendingPointCount}',
                              style: GoogleFonts.jetBrainsMono(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: _queueColor(shiftState.pendingPointCount),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _QueueBar(count: shiftState.pendingPointCount),
                        const SizedBox(height: 6),
                        Text(
                          _queueLabel(shiftState.pendingPointCount),
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: _queueColor(shiftState.pendingPointCount),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // ── Permissions ───────────────────────────────────────────
                _SectionLabel(label: 'Permissions'),
                const SizedBox(height: 8),
                RbCard(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _PermRow(
                          label: 'Location',
                          granted: permState.status?.location,
                          isChecking: permState.isChecking,
                        ),
                        const SizedBox(height: 6),
                        _PermRow(
                          label: 'Background Location',
                          granted: permState.status?.backgroundLocation,
                          isChecking: permState.isChecking,
                        ),
                        const SizedBox(height: 6),
                        _PermRow(
                          label: 'Battery Optimization',
                          granted: permState.status?.batteryOptimizationDisabled,
                          isChecking: permState.isChecking,
                          trueLabel: 'Exempt',
                          falseLabel: 'Not exempt',
                        ),
                        const SizedBox(height: 12),
                        RbBtn(
                          label: permState.isChecking
                              ? 'Checking…'
                              : 'Re-check permissions',
                          variant: RbBtnVariant.outline,
                          size: RbBtnSize.sm,
                          loading: permState.isChecking,
                          onPressed: permState.isChecking
                              ? null
                              : () => ref
                                  .read(fieldPermissionCoordinatorProvider
                                      .notifier)
                                  .check(),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // ── Sync history ──────────────────────────────────────────
                _SectionLabel(
                  label: 'Sync History',
                  action: 'Refresh',
                  onAction: () => ref.invalidate(_recentEventsProvider),
                ),
                const SizedBox(height: 8),
                eventsAsync.when(
                  loading: () => const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: RbColors.accent),
                    ),
                  ),
                  error: (e, _) => RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Text('Error loading events: $e',
                          style: GoogleFonts.inter(
                              fontSize: 13, color: RbColors.danger)),
                    ),
                  ),
                  data: (events) {
                    if (events.isEmpty) {
                      return RbCard(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Text(
                            shift == null
                                ? 'No active shift — start a shift to see events.'
                                : 'No events recorded yet.',
                            style:
                                GoogleFonts.inter(fontSize: 13, color: c.muted),
                          ),
                        ),
                      );
                    }
                    final shown = events.take(5).toList();
                    return RbCard(
                      child: Column(
                        children: [
                          for (int i = 0; i < shown.length; i++)
                            _EventRow(event: shown[i], isFirst: i == 0),
                        ],
                      ),
                    );
                  },
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  static String _fmtIso(String? iso) {
    if (iso == null) return '—';
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return iso;
    return '${dt.year}-${_p2(dt.month)}-${_p2(dt.day)} '
        '${_p2(dt.hour)}:${_p2(dt.minute)}:${_p2(dt.second)}';
  }

  static String _p2(int n) => n.toString().padLeft(2, '0');

  static Color _queueColor(int count) {
    if (count == 0) return RbColors.success;
    if (count <= 100) return RbColors.warn;
    if (count <= 500) return const Color(0xFFE06020);
    return RbColors.danger;
  }

  static String _queueLabel(int count) {
    if (count == 0) return 'Queue empty — all synced';
    if (count <= 100) return 'Low backlog';
    if (count <= 500) return 'Moderate backlog — check connectivity';
    return 'High backlog — sync may be blocked';
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, this.action, this.onAction});
  final String label;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Row(
      children: [
        Text(
          label.toUpperCase(),
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
            color: c.muted,
          ),
        ),
        const Spacer(),
        if (action != null)
          GestureDetector(
            onTap: onAction,
            child: Text(
              action!,
              style: GoogleFonts.inter(
                fontSize: 12,
                color: RbColors.accent,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}

class _DiagRow extends StatelessWidget {
  const _DiagRow({
    required this.label,
    required this.value,
    this.mono = false,
    this.isLast = false,
  });
  final String label;
  final String value;
  final bool mono;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: GoogleFonts.inter(fontSize: 12, color: c.muted),
            ),
          ),
          Expanded(
            child: mono
                ? Text(
                    value,
                    style: GoogleFonts.jetBrainsMono(
                        fontSize: 12, color: c.ink),
                    overflow: TextOverflow.ellipsis,
                  )
                : Text(
                    value,
                    style: GoogleFonts.inter(fontSize: 13, color: c.ink),
                    overflow: TextOverflow.ellipsis,
                  ),
          ),
        ],
      ),
    );
  }
}

class _QueueBar extends StatelessWidget {
  const _QueueBar({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    const maxDisplay = 500.0;
    final fraction = (count / maxDisplay).clamp(0.0, 1.0);
    final color = count == 0
        ? RbColors.success
        : count <= 100
            ? RbColors.warn
            : count <= 500
                ? const Color(0xFFE06020)
                : RbColors.danger;

    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: LinearProgressIndicator(
        value: fraction == 0 ? 0 : fraction.clamp(0.04, 1.0),
        backgroundColor: RbColors.line,
        color: color,
        minHeight: 6,
      ),
    );
  }
}

class _PermRow extends StatelessWidget {
  const _PermRow({
    required this.label,
    required this.granted,
    this.isChecking = false,
    this.trueLabel = 'Granted',
    this.falseLabel = 'Denied',
  });
  final String label;
  final bool? granted;
  final bool isChecking;
  final String trueLabel;
  final String falseLabel;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Row(
      children: [
        Expanded(
          child: Text(label,
              style: GoogleFonts.inter(fontSize: 13, color: c.ink)),
        ),
        if (isChecking)
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: RbColors.accent),
          )
        else if (granted == null)
          Text('Unknown',
              style: GoogleFonts.inter(fontSize: 12, color: c.muted))
        else
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                granted! ? Icons.check_circle_outline : Icons.cancel_outlined,
                size: 14,
                color: granted! ? RbColors.success : RbColors.danger,
              ),
              const SizedBox(width: 4),
              Text(
                granted! ? trueLabel : falseLabel,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: granted! ? RbColors.success : RbColors.danger,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.isFirst});
  final LocalFieldEvent event;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          Icon(_eventIcon(event.eventType), size: 16, color: c.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.eventType,
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: c.ink),
                ),
                Text(
                  event.clientEventId,
                  style: GoogleFonts.jetBrainsMono(
                      fontSize: 10, color: c.muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _SyncStatusBadge(status: event.syncStatus),
        ],
      ),
    );
  }

  static IconData _eventIcon(String type) {
    switch (type) {
      case 'visit':
        return Icons.add_location_alt_outlined;
      case 'stop':
        return Icons.coffee_outlined;
      default:
        return Icons.event_outlined;
    }
  }
}

class _SyncStatusBadge extends StatelessWidget {
  const _SyncStatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, bg) = _colors(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status,
        style: GoogleFonts.inter(
            fontSize: 11, color: color, fontWeight: FontWeight.w500),
      ),
    );
  }

  static (Color, Color) _colors(String status) {
    switch (status) {
      case EventSyncStatus.acked:
        return (RbColors.success, RbColors.successSoft);
      case EventSyncStatus.inFlight:
        return (RbColors.accent, RbColors.accentSoft);
      case EventSyncStatus.rejected:
      case EventSyncStatus.failed:
        return (RbColors.danger, RbColors.dangerSoft);
      case EventSyncStatus.pending:
      default:
        return (RbColors.warn, RbColors.warnSoft);
    }
  }
}
