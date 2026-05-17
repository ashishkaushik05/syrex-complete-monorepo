import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/location/background_location_service.dart';
import '../../../core/permissions/permission_service.dart';
import '../../../shared/widgets/premium_surfaces.dart';
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

  Future<void> _startShift() async {
    setState(() {
      _pending = true;
      _message = null;
    });
    try {
      await ref.read(fieldRepositoryProvider).startShift();
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
      await BackgroundLocationService.stop();
      await ref.read(fieldRepositoryProvider).endShift();
      ref.invalidate(activeShiftProvider);
      ref.invalidate(activeStopProvider);
      setState(() => _message = 'Shift ended.');
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
                          const Text('Shift Status', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          StateBadge(
                            label: active ? 'ACTIVE' : 'OFF SHIFT',
                            color: active ? AppPalette.mint : AppPalette.amber,
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        active
                            ? 'Started ${_displayTime(shift!.startedAt)}'
                            : 'Start shift to unlock visits and stops.',
                        style: const TextStyle(color: Color(0xFF60707E)),
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
                    ],
                  );
                },
              ),
            ),
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
              ],
            ),
          ],
        ),
      ),
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
