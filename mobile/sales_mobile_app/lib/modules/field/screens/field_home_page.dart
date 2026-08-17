import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:latlong2/latlong.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/location/background_location_service.dart';
import '../../../core/location/field_sync_store.dart';
import '../../../shared/widgets/rb_components.dart';
import '../controllers/field_shift_controller.dart';
import '../models/field_models.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

bool shouldEndFieldShift({
  required ShiftModel? serverShift,
  required bool hasLocalActiveShift,
}) =>
    serverShift != null || hasLocalActiveShift;

class FieldHomePage extends ConsumerStatefulWidget {
  const FieldHomePage({super.key});

  @override
  ConsumerState<FieldHomePage> createState() => _FieldHomePageState();
}

class _FieldHomePageState extends ConsumerState<FieldHomePage> {
  bool _pending = false;

  Future<void> _toggleShift(ShiftModel? shift) async {
    setState(() => _pending = true);
    try {
      final localShiftState = ref.read(fieldShiftControllerProvider);
      if (shouldEndFieldShift(
        serverShift: shift,
        hasLocalActiveShift: localShiftState.hasActiveShift,
      )) {
        // Mark the shift ending locally, then let FieldSyncWorker drain the
        // remaining queue, call syncEnd, and only then stop the background
        // service (via onShiftCompleted). Stopping it here would strand any
        // un-uploaded points and skip syncEnd. Ensure the worker is running in
        // case this shift was resumed after an app relaunch.
        final syncStore = ref.read(fieldSyncStoreProvider);
        final deviceId = await syncStore.getOrCreateDeviceId();
        await ref.read(fieldShiftControllerProvider.notifier).endShift();
        ref.read(fieldSyncWorkerProvider)
          ..updateDeviceInfo(deviceId: deviceId, platform: _platformName)
          ..start();
      } else {
        final granted = await ref
            .read(fieldPermissionCoordinatorProvider.notifier)
            .requestForShiftStart();
        if (!granted) {
          if (mounted) {
            RbToast.show(context, 'Location permission required');
          }
          setState(() => _pending = false);
          return;
        }
        final syncStore = ref.read(fieldSyncStoreProvider);
        final deviceId = await syncStore.getOrCreateDeviceId();
        final platform = _platformName;
        await ref
            .read(fieldShiftControllerProvider.notifier)
            .startShift(deviceId, platform);
        await BackgroundLocationService.start();
        ref.read(fieldSyncWorkerProvider)
          ..updateDeviceInfo(deviceId: deviceId, platform: platform)
          ..start();
      }
      ref.invalidate(activeShiftProvider);
    } catch (e) {
      if (mounted) RbToast.show(context, 'Error: $e');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  String get _platformName {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'unknown';
  }

  void _refreshTrail() {
    final shift = ref.read(activeShiftProvider).valueOrNull;
    if (shift != null) ref.invalidate(trailForShiftProvider(shift.id));
  }

  Future<void> _endStop() async {
    try {
      final stop = await ref.read(fieldRepositoryProvider).activeStop();
      if (stop == null) return;
      await ref.read(fieldRepositoryProvider).endStop(stopId: stop.id);
      ref.invalidate(activeStopProvider);
    } catch (e) {
      if (mounted) RbToast.show(context, 'Error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final shiftAsync = ref.watch(activeShiftProvider);
    final stopAsync = ref.watch(activeStopProvider);
    final controllerState = ref.watch(fieldShiftControllerProvider);
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: RbColors.accent,
        onRefresh: () async {
          _refreshTrail();
          ref.invalidate(activeShiftProvider);
          ref.invalidate(activeStopProvider);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: RbTopBar(
                title: 'Field Sense',
                actions: [
                  RbIconBtn(
                    icon: Icons.bug_report_outlined,
                    onTap: () => context.push('/field-diagnostics'),
                  ),
                  RbIconBtn(
                    icon: Icons.history_outlined,
                    onTap: () => context.push('/field/shift-history'),
                  ),
                ],
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Offline pending-sync banner
                  if (controllerState.activeShift != null &&
                      controllerState.activeShift!.serverShiftId == null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade100,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: Colors.amber.shade400, width: 0.5),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.cloud_off,
                                size: 16, color: Colors.amber.shade800),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Shift pending sync — will upload when connected',
                                style: GoogleFonts.inter(
                                    fontSize: 12, color: Colors.amber.shade800),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // Big shift card
                  shiftAsync.when(
                    loading: () => const _ShiftCardSkeleton(),
                    error: (e, _) => RbEmpty(
                        icon: Icons.cloud_off_outlined,
                        title: 'Shift status unavailable'),
                    data: (shift) => _ShiftCard(
                      shift: shift,
                      pending: _pending,
                      controllerState: controllerState,
                      onToggle: () => _toggleShift(shift),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Active stop banner
                  stopAsync.maybeWhen(
                    data: (stop) => stop != null && stop.isActive
                        ? Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child:
                                _ActiveStopBanner(stop: stop, onEnd: _endStop),
                          )
                        : const SizedBox.shrink(),
                    orElse: () => const SizedBox.shrink(),
                  ),

                  // Field actions
                  Row(
                    children: [
                      Expanded(
                        child: _FieldActionCard(
                          icon: Icons.add_location_alt_outlined,
                          label: 'Log visit',
                          sub: 'Record current location',
                          onTap: () => context.push('/field/visit'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _FieldActionCard(
                          icon: Icons.coffee_outlined,
                          label: 'Take a stop',
                          sub: 'Pause tracking',
                          onTap: () => context.push('/field/stop'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Today's visits
                  shiftAsync.maybeWhen(
                    data: (shift) => shift != null
                        ? _TodayVisits(shiftId: shift.id)
                        : const SizedBox.shrink(),
                    orElse: () => const SizedBox.shrink(),
                  ),

                  const SizedBox(height: 16),

                  // More section
                  RbSection(label: 'More'),
                  const SizedBox(height: 8),
                  RbCard(
                    child: Column(
                      children: [
                        RbRow(
                          isFirst: true,
                          onTap: () => context.push('/field/shift-history'),
                          child: Row(
                            children: [
                              Icon(Icons.history_outlined,
                                  size: 18, color: c.muted),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Text('Shift history',
                                      style: GoogleFonts.inter(
                                          fontSize: 14, color: c.ink))),
                              Icon(Icons.chevron_right,
                                  size: 16, color: c.muted),
                            ],
                          ),
                        ),
                        RbRow(
                          onTap: () {},
                          child: Row(
                            children: [
                              Icon(Icons.sync_outlined,
                                  size: 18, color: c.muted),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Text('Background sync settings',
                                      style: GoogleFonts.inter(
                                          fontSize: 14, color: c.ink))),
                              Icon(Icons.chevron_right,
                                  size: 16, color: c.muted),
                            ],
                          ),
                        ),
                      ],
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
}

// ─── Shift card ────────────────────────────────────────────────────────────────

class _ShiftCard extends StatelessWidget {
  const _ShiftCard({
    required this.shift,
    required this.pending,
    required this.controllerState,
    required this.onToggle,
  });
  final ShiftModel? shift;
  final bool pending;
  final FieldShiftState controllerState;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final isActive = shift != null || controllerState.hasActiveShift;
    final startedAt =
        shift?.startedAt ?? controllerState.activeShift?.startedAt;

    return RbCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Live trail map (falls back to grid when no shift/trail)
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: SizedBox(
              height: 120,
              child: _ShiftMiniMap(shiftId: shift?.id, isActive: isActive),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      isActive && startedAt != null
                          ? _shiftDuration(startedAt)
                          : '00:00',
                      style: GoogleFonts.inter(
                          fontSize: 32,
                          fontWeight: FontWeight.w700,
                          color: c.ink,
                          fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                    const Spacer(),
                    StatusDot(
                        tone: isActive ? RbTone.success : RbTone.neutral,
                        pulse: isActive,
                        label: isActive ? 'Live' : 'Offline'),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  isActive && startedAt != null
                      ? 'Since ${_fmtTime(startedAt)}'
                      : 'No active shift',
                  style: GoogleFonts.inter(fontSize: 12, color: c.muted),
                ),
                // Queue depth chip
                if (controllerState.pendingPointCount > 0) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade100,
                      borderRadius: BorderRadius.circular(20),
                      border:
                          Border.all(color: Colors.orange.shade300, width: 0.5),
                    ),
                    child: Text(
                      '${controllerState.pendingPointCount} points queued',
                      style: GoogleFonts.inter(
                          fontSize: 11, color: Colors.orange.shade800),
                    ),
                  ),
                ],
                // Sync error note
                if (controllerState.activeShift?.lastErrorCode != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Sync error: ${controllerState.activeShift!.lastErrorCode}',
                    style: GoogleFonts.inter(
                        fontSize: 11, color: Colors.red.shade600),
                  ),
                ],
                const SizedBox(height: 12),
                RbBtn(
                  label: isActive ? 'End shift' : 'Start shift',
                  variant:
                      isActive ? RbBtnVariant.outline : RbBtnVariant.accent,
                  size: RbBtnSize.lg,
                  loading: pending,
                  onPressed: pending ? null : onToggle,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _shiftDuration(String iso) {
    final start = DateTime.tryParse(iso)?.toLocal();
    if (start == null) return '00:00';
    final diff = DateTime.now().difference(start);
    final h = diff.inHours.toString().padLeft(2, '0');
    final m = (diff.inMinutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String _fmtTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return '—';
    final h = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }
}

// ─── Shift mini-map ──────────────────────────────────────────────────────────

/// Compact, non-interactive map embedded in the shift card. Shows the active
/// shift's trail polyline and a marker at the current (latest) location. Falls
/// back to the decorative grid when there is no shift or no synced points yet.
class _ShiftMiniMap extends ConsumerWidget {
  const _ShiftMiniMap({required this.shiftId, required this.isActive});

  final String? shiftId;
  final bool isActive;

  Widget _fallback() => Stack(
        children: [
          const MapBackground(),
          Center(
            child: StatusDot(
                tone: isActive ? RbTone.success : RbTone.neutral,
                pulse: isActive,
                size: 12),
          ),
        ],
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = shiftId;
    if (id == null) return _fallback();

    final trailAsync = ref.watch(trailForShiftProvider(id));
    return trailAsync.maybeWhen(
      data: (trail) {
        final points = trail.points.map((p) => LatLng(p.lat, p.lng)).toList();
        if (points.isEmpty) return _fallback();
        final current = points.last;

        return FlutterMap(
          options: MapOptions(
            initialCenter: current,
            initialZoom: 15,
            // Embedded in a scroll view — keep the map static.
            interactionOptions:
                const InteractionOptions(flags: InteractiveFlag.none),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.syrex.sales_mobile_app',
            ),
            if (points.length >= 2)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: points,
                    color: RbColors.accent,
                    strokeWidth: 3.0,
                  ),
                ],
              ),
            MarkerLayer(
              markers: [
                Marker(
                  point: current,
                  width: 24,
                  height: 24,
                  child: Center(
                    child: StatusDot(
                        tone: isActive ? RbTone.success : RbTone.neutral,
                        pulse: isActive,
                        size: 14),
                  ),
                ),
              ],
            ),
          ],
        );
      },
      orElse: _fallback,
    );
  }
}

class _ShiftCardSkeleton extends StatelessWidget {
  const _ShiftCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 240,
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: RbColors.line, width: 0.5),
      ),
      child: const Center(
          child: CircularProgressIndicator(
              strokeWidth: 2, color: RbColors.accent)),
    );
  }
}

// ─── Active stop banner ────────────────────────────────────────────────────────

class _ActiveStopBanner extends StatelessWidget {
  const _ActiveStopBanner({required this.stop, required this.onEnd});
  final FieldStopModel stop;
  final VoidCallback onEnd;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: RbColors.warnSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: RbColors.warn.withOpacity(0.4), width: 0.5),
      ),
      child: Row(
        children: [
          const Icon(Icons.coffee_outlined, size: 18, color: RbColors.warn),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(stop.reason ?? 'Break',
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: RbColors.warn)),
                Text(_duration(stop.startedAt),
                    style:
                        GoogleFonts.inter(fontSize: 12, color: RbColors.warn)),
              ],
            ),
          ),
          RbBtn(
            label: 'End stop',
            variant: RbBtnVariant.outline,
            size: RbBtnSize.sm,
            onPressed: onEnd,
          ),
        ],
      ),
    );
  }

  static String _duration(String iso) {
    final start = DateTime.tryParse(iso)?.toLocal();
    if (start == null) return '—';
    final diff = DateTime.now().difference(start);
    final m = diff.inMinutes;
    return m < 60 ? '${m}m' : '${diff.inHours}h ${m % 60}m';
  }
}

// ─── Field action card ─────────────────────────────────────────────────────────

class _FieldActionCard extends StatelessWidget {
  const _FieldActionCard({
    required this.icon,
    required this.label,
    required this.sub,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final String sub;
  final VoidCallback onTap;

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
            Icon(icon, size: 22, color: c.ink),
            const SizedBox(height: 10),
            Text(label,
                style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w600, color: c.ink)),
            const SizedBox(height: 2),
            Text(sub, style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
          ],
        ),
      ),
    );
  }
}

// ─── Today's visits ────────────────────────────────────────────────────────────

class _TodayVisits extends ConsumerWidget {
  const _TodayVisits({required this.shiftId});
  final String shiftId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(visitsForShiftProvider(shiftId));

    return async.maybeWhen(
      data: (visits) {
        if (visits.isEmpty) return const SizedBox.shrink();
        final latest = visits.take(3).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            RbSection(
              label: "Today's visits",
              action: visits.length > 3 ? 'See all' : null,
              onAction: () {},
            ),
            const SizedBox(height: 8),
            RbCard(
              child: Column(
                children: [
                  for (int i = 0; i < latest.length; i++)
                    _VisitRow(visit: latest[i], isFirst: i == 0),
                ],
              ),
            ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _VisitRow extends StatelessWidget {
  const _VisitRow({required this.visit, required this.isFirst});
  final FieldVisitModel visit;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return RbRow(
      isFirst: isFirst,
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
                color: RbColors.accent, shape: BoxShape.circle),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  visit.description ?? 'Visit logged',
                  style: GoogleFonts.inter(fontSize: 14, color: c.ink),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${visit.lat.toStringAsFixed(4)}, ${visit.lng.toStringAsFixed(4)}',
                  style:
                      GoogleFonts.jetBrainsMono(fontSize: 11, color: c.muted),
                ),
              ],
            ),
          ),
          Text(_fmtTime(visit.recordedAt),
              style: GoogleFonts.inter(fontSize: 12, color: c.muted)),
        ],
      ),
    );
  }

  static String _fmtTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return '—';
    final h = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }
}
