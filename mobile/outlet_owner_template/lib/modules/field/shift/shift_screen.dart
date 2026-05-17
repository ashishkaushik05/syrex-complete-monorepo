import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/location/background_location_service.dart';
import '../models/shift.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

class ShiftScreen extends ConsumerStatefulWidget {
  const ShiftScreen({super.key});

  @override
  ConsumerState<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends ConsumerState<ShiftScreen> {
  bool _actionPending = false;

  Future<void> _startShift() async {
    setState(() => _actionPending = true);
    try {
      await ref.read(fieldRepositoryProvider).startShift();
      await BackgroundLocationService.start();
      ref.invalidate(activeShiftProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_friendlyError(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _actionPending = false);
    }
  }

  Future<void> _endShift() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('End Shift'),
        content: const Text('Are you sure you want to end your shift?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('End Shift')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _actionPending = true);
    try {
      await BackgroundLocationService.stop();
      await ref.read(fieldRepositoryProvider).endShift();
      ref.invalidate(activeShiftProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_friendlyError(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _actionPending = false);
    }
  }

  Future<void> _extendShift() async {
    setState(() => _actionPending = true);
    try {
      await ref.read(fieldRepositoryProvider).extendShift();
      ref.invalidate(activeShiftProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Shift extended — auto-close disabled')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_friendlyError(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _actionPending = false);
    }
  }

  String _friendlyError(Object e) {
    final msg = e.toString();
    if (msg.contains('already active')) return 'A shift is already active.';
    if (msg.contains('No active shift')) return 'No active shift found.';
    if (msg.contains('isFieldEnabled')) {
      return 'Field Sense is not enabled for your account.';
    }
    return 'Something went wrong. Please try again.';
  }

  String _elapsed(String startedAt) {
    final start = DateTime.tryParse(startedAt);
    if (start == null) return '';
    final diff = DateTime.now().difference(start);
    final h = diff.inHours;
    final m = diff.inMinutes % 60;
    return h > 0 ? '${h}h ${m}m' : '${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final shiftAsync = ref.watch(activeShiftProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Field Sense'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'Attendance',
            onPressed: () => context.push('/field/attendance'),
          ),
        ],
      ),
      body: shiftAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              Text('Could not load shift status',
                  style: Theme.of(context).textTheme.bodyLarge),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(activeShiftProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (shift) => _buildBody(shift),
      ),
      floatingActionButton: shiftAsync.valueOrNull != null
          ? FloatingActionButton.extended(
              onPressed:
                  _actionPending ? null : () => context.push('/field/visit/log'),
              icon: const Icon(Icons.add_location_alt),
              label: const Text('Log Visit'),
            )
          : null,
    );
  }

  Widget _buildBody(Shift? shift) {
    final colorScheme = Theme.of(context).colorScheme;

    if (shift == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.location_off,
                  size: 72,
                  color: colorScheme.onSurface.withOpacity(0.3)),
              const SizedBox(height: 24),
              Text('No active shift',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text('Start a shift to begin GPS tracking.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurface.withOpacity(0.6),
                      ),
                  textAlign: TextAlign.center),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: _actionPending ? null : _startShift,
                icon: _actionPending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.play_arrow),
                label: const Text('Start Shift'),
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Status card
        Card(
          color: colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.radio_button_on, color: Colors.green),
                    const SizedBox(width: 8),
                    Text('Shift Active',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 12),
                _InfoRow(
                  label: 'Started',
                  value: _formatTime(shift.startedAt),
                ),
                _InfoRow(
                  label: 'Elapsed',
                  value: _elapsed(shift.startedAt),
                ),
                _InfoRow(
                  label: 'Start type',
                  value: shift.startType == 'auto' ? 'Auto-start' : 'Manual',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // GPS tracking status
        FutureBuilder<bool>(
          future: BackgroundLocationService.isRunning,
          builder: (context, snap) {
            final running = snap.data ?? false;
            return Card(
              child: ListTile(
                leading: Icon(
                  running ? Icons.gps_fixed : Icons.gps_not_fixed,
                  color: running ? Colors.green : Colors.orange,
                ),
                title: Text(running
                    ? 'GPS tracking active'
                    : 'GPS tracking not running'),
                subtitle: running
                    ? const Text('Sending location every 10 seconds')
                    : const Text('Tap to start location tracking'),
                trailing: running
                    ? null
                    : TextButton(
                        onPressed: () async {
                          await BackgroundLocationService.start();
                          setState(() {});
                        },
                        child: const Text('Start'),
                      ),
              ),
            );
          },
        ),
        const SizedBox(height: 16),

        // Today's visits
        if (shift.isActive)
          Consumer(
            builder: (context, ref, _) {
              final visitsAsync =
                  ref.watch(visitsForShiftProvider(shift.id));
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Visits today',
                          style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 8),
                      visitsAsync.when(
                        loading: () =>
                            const LinearProgressIndicator(),
                        error: (_, __) =>
                            const Text('Could not load visits'),
                        data: (visits) => Text(
                          visits.isEmpty
                              ? 'No visits logged yet'
                              : '${visits.length} visit${visits.length == 1 ? '' : 's'} logged',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),

        const SizedBox(height: 24),

        // Actions
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _actionPending ? null : _extendShift,
                icon: const Icon(Icons.more_time),
                label: const Text('Extend'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: _actionPending ? null : _endShift,
                style: FilledButton.styleFrom(
                    backgroundColor:
                        Theme.of(context).colorScheme.error),
                icon: _actionPending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white))
                    : const Icon(Icons.stop_circle_outlined),
                label: const Text('End Shift'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _formatTime(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    final local = dt.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.black54)),
          ),
          Expanded(
            child: Text(value,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}
