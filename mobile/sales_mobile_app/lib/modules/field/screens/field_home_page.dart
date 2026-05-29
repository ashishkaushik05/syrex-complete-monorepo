import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/location/background_location_service.dart';
import '../../../core/location/field_sync_store.dart';
import '../../../core/permissions/field_permission_service.dart';
import '../../../shared/widgets/rb_components.dart';
import '../models/field_models.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

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
      final repository = ref.read(fieldRepositoryProvider);
      final syncStore = ref.read(fieldSyncStoreProvider);
      final deviceId = await syncStore.getOrCreateDeviceId();
      if (shift != null) {
        await BackgroundLocationService.stop();
        final v2Shift = await _ensureV2ShiftForEnd(
          repository: repository,
          syncStore: syncStore,
          shift: shift,
          deviceId: deviceId,
        );
        await _flushPendingPoints(
          repository: repository,
          syncStore: syncStore,
          deviceId: deviceId,
          clientShiftId: v2Shift.clientShiftId,
          serverShiftId: v2Shift.id,
        );
        await repository.syncEndShift(
          clientShiftId: v2Shift.clientShiftId!,
          endedAt: DateTime.now().toUtc(),
          deviceId: deviceId,
        );
        await syncStore.clearActiveShift();
        await repository.reportSyncStatus(
          deviceId: deviceId,
          clientShiftId: v2Shift.clientShiftId,
          serverShiftId: v2Shift.id,
          platform: _platformName,
          lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
          pendingQueueDepth: (await syncStore.readPendingPoints()).length,
        );
      } else {
        final perms = await FieldPermissionService.requestAll();
        if (!perms.location) {
          await _reportPermissionStatus(syncStore, repository, deviceId, perms);
          if (mounted) {
            RbToast.show(context, 'Location permission required');
          }
          setState(() => _pending = false);
          return;
        }
        if (!perms.backgroundLocation) {
          await _reportPermissionStatus(syncStore, repository, deviceId, perms);
          if (mounted) {
            RbToast.show(context, 'Background location permission required');
          }
          setState(() => _pending = false);
          return;
        }
        final startedAt = DateTime.now().toUtc();
        final clientShiftId = FieldSyncStore.newClientShiftId(deviceId);
        final syncedShift = await repository.syncStartShift(
          clientShiftId: clientShiftId,
          startedAt: startedAt,
          deviceId: deviceId,
          platform: _platformName,
        );
        await syncStore.saveActiveShift(
          clientShiftId: syncedShift.clientShiftId,
          serverShiftId: syncedShift.serverShiftId,
        );
        await repository.reportSyncStatus(
          deviceId: deviceId,
          clientShiftId: syncedShift.clientShiftId,
          serverShiftId: syncedShift.serverShiftId,
          platform: _platformName,
          lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
          pendingQueueDepth: (await syncStore.readPendingPoints()).length,
          permissionsSummary: _permissionSummary(perms),
        );
        await BackgroundLocationService.start();
      }
      ref.invalidate(activeShiftProvider);
    } catch (e) {
      if (mounted) RbToast.show(context, 'Error: $e');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<ShiftModel> _ensureV2ShiftForEnd({
    required FieldRepository repository,
    required FieldSyncStore syncStore,
    required ShiftModel shift,
    required String deviceId,
  }) async {
    if (shift.clientShiftId != null && shift.clientShiftId!.isNotEmpty) {
      await syncStore.saveActiveShift(
        clientShiftId: shift.clientShiftId!,
        serverShiftId: shift.id,
      );
      return shift;
    }

    final stored = await syncStore.readActiveShift();
    if (stored != null) {
      final reconciled = await repository.syncStartShift(
        clientShiftId: stored.clientShiftId,
        startedAt: DateTime.tryParse(shift.startedAt)?.toUtc() ??
            DateTime.now().toUtc(),
        deviceId: deviceId,
        platform: _platformName,
      );
      await syncStore.saveActiveShift(
        clientShiftId: reconciled.clientShiftId,
        serverShiftId: reconciled.serverShiftId,
      );
      return reconciled.shift;
    }

    final clientShiftId = FieldSyncStore.newClientShiftId(deviceId);
    final reconciled = await repository.syncStartShift(
      clientShiftId: clientShiftId,
      startedAt:
          DateTime.tryParse(shift.startedAt)?.toUtc() ?? DateTime.now().toUtc(),
      deviceId: deviceId,
      platform: _platformName,
    );
    await syncStore.saveActiveShift(
      clientShiftId: reconciled.clientShiftId,
      serverShiftId: reconciled.serverShiftId,
    );
    return reconciled.shift;
  }

  Future<void> _flushPendingPoints({
    required FieldRepository repository,
    required FieldSyncStore syncStore,
    required String deviceId,
    required String? clientShiftId,
    required String serverShiftId,
  }) async {
    if (clientShiftId == null || clientShiftId.isEmpty) return;
    var pending = await syncStore.readPendingPoints();
    while (pending.isNotEmpty) {
      final batchSize = pending.length < 500 ? pending.length : 500;
      final batch = List<Map<String, dynamic>>.from(
        pending.take(batchSize),
      );
      try {
        final ack = await repository.ingestLocationsV2(
          clientShiftId: clientShiftId,
          serverShiftId: serverShiftId,
          deviceId: deviceId,
          points: batch,
        );
        if (ack.retryable) break;
        final removable = ack.removablePointIds;
        pending = pending
            .where((point) => !removable.contains(point['clientPointId']))
            .toList();
        await syncStore.writePendingPoints(pending);
      } catch (_) {
        await repository.reportSyncStatus(
          deviceId: deviceId,
          clientShiftId: clientShiftId,
          serverShiftId: serverShiftId,
          platform: _platformName,
          lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
          lastSyncErrorCode: 'FINAL_FLUSH_FAILED',
          pendingQueueDepth: pending.length,
        );
        break;
      }
    }
  }

  Future<void> _reportPermissionStatus(
    FieldSyncStore syncStore,
    FieldRepository repository,
    String deviceId,
    FieldPermissionStatus perms,
  ) async {
    await repository.reportSyncStatus(
      deviceId: deviceId,
      platform: _platformName,
      lastSyncAttemptAt: DateTime.now().toUtc().toIso8601String(),
      pendingQueueDepth: (await syncStore.readPendingPoints()).length,
      permissionsSummary: _permissionSummary(perms),
    );
  }

  Map<String, dynamic> _permissionSummary(FieldPermissionStatus perms) {
    return {
      'location': perms.location,
      'backgroundLocation': perms.backgroundLocation,
      'batteryOptimizationDisabled': perms.batteryOptimizationDisabled,
    };
  }

  String get _platformName {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'unknown';
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
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: RbColors.accent,
        onRefresh: () async {
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
                  // Big shift card
                  shiftAsync.when(
                    loading: () => const _ShiftCardSkeleton(),
                    error: (e, _) => RbEmpty(
                        icon: Icons.cloud_off_outlined,
                        title: 'Shift status unavailable'),
                    data: (shift) => _ShiftCard(
                      shift: shift,
                      pending: _pending,
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
  const _ShiftCard(
      {required this.shift, required this.pending, required this.onToggle});
  final ShiftModel? shift;
  final bool pending;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final isActive = shift != null;

    return RbCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Map background
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: SizedBox(
              height: 120,
              child: Stack(
                children: [
                  const MapBackground(),
                  Center(
                    child: StatusDot(
                        tone: isActive ? RbTone.success : RbTone.neutral,
                        pulse: isActive,
                        size: 12),
                  ),
                ],
              ),
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
                      isActive ? _shiftDuration(shift!.startedAt) : '00:00',
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
                  isActive
                      ? 'Since ${_fmtTime(shift!.startedAt)}'
                      : 'No active shift',
                  style: GoogleFonts.inter(fontSize: 12, color: c.muted),
                ),
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
