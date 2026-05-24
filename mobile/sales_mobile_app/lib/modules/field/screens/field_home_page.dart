import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/location/background_location_service.dart';
import '../../../core/location/field_sync_store.dart';
import '../../../core/permissions/field_permission_service.dart';
import '../../../core/permissions/permission_service.dart';
import '../../../shared/widgets/premium_surfaces.dart';
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
  String? _message;
  final MapController _mapController = MapController();

  Future<void> _startShift() async {
    setState(() {
      _pending = true;
      _message = null;
    });
    try {
      final permissions = await FieldPermissionService.requestAll();
      if (!permissions.location || !permissions.backgroundLocation) {
        setState(() {
          _message = 'Location and background tracking permissions are required.';
        });
        return;
      }
      final syncStore = ref.read(fieldSyncStoreProvider);
      final deviceId = await syncStore.getOrCreateDeviceId();
      final clientShiftId = FieldSyncStore.newClientShiftId(deviceId);
      final result = await ref.read(fieldRepositoryProvider).syncStartShift(
            clientShiftId: clientShiftId,
            startedAt: DateTime.now(),
            deviceId: deviceId,
            platform: Platform.isIOS ? 'ios' : 'android',
          );
      await syncStore.saveActiveShift(
        clientShiftId: result.clientShiftId,
        serverShiftId: result.serverShiftId,
      );
      await BackgroundLocationService.start();
      ref.invalidate(activeShiftProvider);
      setState(() => _message = 'Shift started.');
    } catch (e) {
      setState(() => _message = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<void> _endShift() async {
    setState(() {
      _pending = true;
      _message = null;
    });
    try {
      final syncStore = ref.read(fieldSyncStoreProvider);
      final active = await syncStore.readActiveShift();
      final deviceId = await syncStore.getOrCreateDeviceId();
      await BackgroundLocationService.stop();
      if (active != null) {
        await _flushQueuedLocations(active, deviceId);
        await ref.read(fieldRepositoryProvider).syncEndShift(
              clientShiftId: active.clientShiftId,
              endedAt: DateTime.now(),
              deviceId: deviceId,
            );
        final remaining = await syncStore.readPendingPoints();
        if (remaining.isEmpty) {
          await syncStore.clearActiveShift();
        }
      } else {
        await ref.read(fieldRepositoryProvider).endShift();
      }
      ref.invalidate(activeShiftProvider);
      ref.invalidate(activeStopProvider);
      setState(() => _message = 'Shift ended.');
    } catch (e) {
      setState(() => _message = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<void> _flushQueuedLocations(
    ActiveFieldShift active,
    String deviceId,
  ) async {
    final syncStore = ref.read(fieldSyncStoreProvider);
    var queue = await syncStore.readPendingPoints();
    const maxBatch = 500;
    while (queue.isNotEmpty) {
      final end = queue.length < maxBatch ? queue.length : maxBatch;
      final batch = List<Map<String, dynamic>>.from(queue.sublist(0, end));
      final ack = await ref.read(fieldRepositoryProvider).ingestLocationsV2(
            clientShiftId: active.clientShiftId,
            serverShiftId: active.serverShiftId,
            deviceId: deviceId,
            points: batch,
          );
      if (ack.retryable) return;
      final removable = ack.removablePointIds;
      queue = queue
          .where((point) => !removable.contains(point['clientPointId']))
          .toList();
      await syncStore.writePendingPoints(queue);
      if (removable.isEmpty) return;
    }
  }

  Future<void> _extendShift() async {
    setState(() {
      _pending = true;
      _message = null;
    });
    try {
      await ref.read(fieldRepositoryProvider).extendShift();
      ref.invalidate(activeShiftProvider);
      setState(() => _message = 'Shift extended.');
    } catch (e) {
      setState(() => _message = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  String _friendlyError(Object err) {
    final msg = err.toString();
    if (msg.contains('No active shift')) return 'No active shift found.';
    if (msg.contains('Field Sense not enabled')) {
      return 'Field Sense is not enabled for your account.';
    }
    if (msg.contains('already exists')) return 'A shift is already active.';
    if (msg.contains('SocketException')) return 'Network unavailable. Try again.';
    return 'Action failed. Please retry.';
  }

  bool _showExtendButton(ShiftModel shift) {
    if (!shift.isActive) return false;
    if (shift.endType == 'extended') return false;
    final now = DateTime.now();
    return now.hour > 18 || (now.hour == 18 && now.minute >= 30);
  }

  @override
  Widget build(BuildContext context) {
    final canUseField = ref.watch(canUseFieldProvider);
    final shiftAsync = ref.watch(activeShiftProvider);
    final stopAsync = ref.watch(activeStopProvider);

    if (!canUseField) {
      return const PremiumGradientBackground(
        child: EmptyStateView(
          title: 'Field Access Restricted',
          subtitle: 'Your role does not include Field Sense permissions.',
          icon: Icons.lock_outline,
        ),
      );
    }

    return PremiumGradientBackground(
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(activeShiftProvider);
          ref.invalidate(activeStopProvider);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            const Text(
              'Field',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppPalette.ink),
            ),
            const SizedBox(height: 4),
            const Text(
              'Shift controls, visits, stops, attendance and map layers',
              style: TextStyle(color: Color(0xFF566271)),
            ),
            const SizedBox(height: 16),
            if (_message != null)
              InlineBanner(
                message: _message!,
                type: _message!.contains('failed') || _message!.contains('not')
                    ? BannerType.warning
                    : BannerType.success,
              ),
            PremiumCard(
              child: shiftAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Unable to load shift status'),
                data: (shift) {
                  final active = shift?.isActive == true;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Shift Status',
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                          ),
                          StateBadge(
                            label: active ? 'ACTIVE' : 'OFF SHIFT',
                            color: active ? AppPalette.mint : AppPalette.amber,
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (active && shift != null) ...[
                        _ShiftMetaRow(shift: shift),
                        const SizedBox(height: 10),
                      ] else
                        const Text(
                          'Start shift to unlock visits and stops.',
                          style: TextStyle(color: Color(0xFF60707E)),
                        ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: (_pending || active) ? null : _startShift,
                              icon: const Icon(Icons.play_arrow_rounded),
                              label: const Text('Start Shift'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: (_pending || !active) ? null : _endShift,
                              icon: const Icon(Icons.stop_circle_outlined),
                              label: const Text('End Shift'),
                            ),
                          ),
                        ],
                      ),
                      if (active && shift != null && _showExtendButton(shift)) ...[
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _pending ? null : _extendShift,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppPalette.amber,
                              side: BorderSide(color: AppPalette.amber.withOpacity(0.5)),
                            ),
                            icon: const Icon(Icons.more_time_rounded),
                            label: const Text('Extend Shift'),
                          ),
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
            // Trail mini map — only when shift is active
            shiftAsync.whenData((shift) => shift).value?.isActive == true
                ? _TrailMiniMap(
                    shiftId: shiftAsync.value!.id,
                    mapController: _mapController,
                  )
                : const SizedBox.shrink(),
            PremiumCard(
              child: stopAsync.when(
                loading: () => const SizedBox(height: 4),
                error: (_, __) => const Text('Unable to load stop status'),
                data: (stop) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      stop == null ? 'No active stop' : 'Stop running',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    StateBadge(
                      label: stop == null ? 'CLEAR' : 'STOPPED',
                      color: stop == null ? AppPalette.info : AppPalette.rose,
                    )
                  ],
                ),
              ),
            ),
            QuickActionRail(
              actions: [
                QuickActionItem(
                  label: 'Create Visit',
                  icon: Icons.add_location_alt_rounded,
                  onTap: () => context.push('/field/visit'),
                ),
                QuickActionItem(
                  label: 'Report Stop',
                  icon: Icons.pause_circle_filled_rounded,
                  color: AppPalette.rose,
                  onTap: () => context.push('/field/stop'),
                ),
                QuickActionItem(
                  label: 'Attendance',
                  icon: Icons.event_available_rounded,
                  onTap: () => context.push('/field/attendance'),
                ),
                QuickActionItem(
                  label: 'Agent Map',
                  icon: Icons.map_rounded,
                  onTap: () => context.push('/field/map'),
                ),
                QuickActionItem(
                  label: 'Schedule',
                  icon: Icons.alarm_rounded,
                  onTap: () => context.push('/field/schedule'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// Shows started-at time + live duration ticker + distance from trail
class _ShiftMetaRow extends ConsumerWidget {
  const _ShiftMetaRow({required this.shift});

  final ShiftModel shift;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trailAsync = ref.watch(trailForShiftProvider(shift.id));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.access_time_rounded, size: 15, color: Color(0xFF60707E)),
            const SizedBox(width: 5),
            Text(
              'Started ${_displayTime(shift.startedAt)}',
              style: const TextStyle(color: Color(0xFF60707E), fontSize: 13),
            ),
            const SizedBox(width: 12),
            const Icon(Icons.timer_outlined, size: 15, color: Color(0xFF60707E)),
            const SizedBox(width: 5),
            _LiveDuration(startedAt: shift.startedAt),
          ],
        ),
        const SizedBox(height: 4),
        trailAsync.when(
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
          data: (trail) {
            final km = (trail.totalDistanceMeters / 1000).toStringAsFixed(2);
            return Row(
              children: [
                const Icon(Icons.route_rounded, size: 15, color: Color(0xFF60707E)),
                const SizedBox(width: 5),
                Text(
                  '$km km traveled',
                  style: const TextStyle(color: Color(0xFF60707E), fontSize: 13),
                ),
                const SizedBox(width: 12),
                const Icon(Icons.location_on_outlined, size: 15, color: Color(0xFF60707E)),
                const SizedBox(width: 5),
                Text(
                  '${trail.rawPointCount} pts',
                  style: const TextStyle(color: Color(0xFF60707E), fontSize: 13),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  String _displayTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return iso;
    final h = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    final suffix = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $suffix';
  }
}

// Ticking duration counter
class _LiveDuration extends StatefulWidget {
  const _LiveDuration({required this.startedAt});

  final String startedAt;

  @override
  State<_LiveDuration> createState() => _LiveDurationState();
}

class _LiveDurationState extends State<_LiveDuration> {
  late Timer _timer;
  late Duration _elapsed;

  @override
  void initState() {
    super.initState();
    _elapsed = _compute();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed = _compute());
    });
  }

  Duration _compute() {
    final start = DateTime.tryParse(widget.startedAt)?.toLocal();
    if (start == null) return Duration.zero;
    return DateTime.now().difference(start);
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = _elapsed.inHours;
    final m = _elapsed.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = _elapsed.inSeconds.remainder(60).toString().padLeft(2, '0');
    final label = h > 0 ? '${h}h ${m}m ${s}s' : '${m}m ${s}s';
    return Text(
      label,
      style: const TextStyle(
        color: AppPalette.mint,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
    );
  }
}

// Embedded mini map showing the trail for the active shift
class _TrailMiniMap extends ConsumerWidget {
  const _TrailMiniMap({required this.shiftId, required this.mapController});

  final String shiftId;
  final MapController mapController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trailAsync = ref.watch(trailForShiftProvider(shiftId));

    return trailAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (trail) {
        if (trail.points.isEmpty) return const SizedBox.shrink();

        final latlngs = trail.points
            .map((p) => LatLng(p.lat, p.lng))
            .toList();

        double minLat = latlngs.first.latitude;
        double maxLat = latlngs.first.latitude;
        double minLng = latlngs.first.longitude;
        double maxLng = latlngs.first.longitude;
        for (final p in latlngs) {
          if (p.latitude < minLat) minLat = p.latitude;
          if (p.latitude > maxLat) maxLat = p.latitude;
          if (p.longitude < minLng) minLng = p.longitude;
          if (p.longitude > maxLng) maxLng = p.longitude;
        }
        final center = LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);

        return PremiumCard(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Today\'s Trail',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                    TextButton.icon(
                      onPressed: () => context.push('/field/map'),
                      icon: const Icon(Icons.open_in_full_rounded, size: 14),
                      label: const Text('Full Map', style: TextStyle(fontSize: 13)),
                      style: TextButton.styleFrom(
                        foregroundColor: AppPalette.ocean,
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                  ],
                ),
              ),
              ClipRRect(
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(18),
                  bottomRight: Radius.circular(18),
                ),
                child: SizedBox(
                  height: 210,
                  child: FlutterMap(
                    mapController: mapController,
                    options: MapOptions(
                      initialCenter: center,
                      initialZoom: 14,
                      interactionOptions: const InteractionOptions(
                        flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                      ),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.syrex.sales_mobile_app',
                      ),
                      if (latlngs.length >= 2)
                        PolylineLayer(
                          polylines: [
                            Polyline(
                              points: latlngs,
                              color: AppPalette.ocean,
                              strokeWidth: 3.0,
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          Marker(
                            point: latlngs.last,
                            width: 20,
                            height: 20,
                            child: Container(
                              decoration: BoxDecoration(
                                color: AppPalette.mint,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
