import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/db/local_models.dart';
import '../../../core/field/field_shift_controller.dart';
import '../../../core/location/background_location_service.dart';
import '../../../core/permissions/field_permission_coordinator.dart';

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
      // Request permissions at shift-start context, not at app bootstrap.
      final health = await FieldPermissionCoordinator.instance
          .requestForShiftStart(context);

      if (!health.canStartTracking) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text(
                    'Location permission is required to start a shift.')),
          );
        }
        return;
      }

      if (!health.backgroundLocation && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Background location not granted — tracking will pause when app is minimized.'),
            duration: Duration(seconds: 4),
          ),
        );
      }

      await ref.read(fieldShiftControllerProvider.notifier).startShift();

      // Start background service, passing the clientShiftId so the background
      // isolate knows which shift to attach new points to.
      final state = ref.read(fieldShiftControllerProvider);
      final clientShiftId = state.localShift?.clientShiftId;
      await BackgroundLocationService.start(clientShiftId: clientShiftId);
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
      await ref.read(fieldShiftControllerProvider.notifier).endShift();
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
    final shiftState = ref.watch(fieldShiftControllerProvider);

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
      body: _buildBody(shiftState),
      floatingActionButton: shiftState.hasActiveShift
          ? FloatingActionButton.extended(
              onPressed:
                  _actionPending ? null : () => context.push('/field/visit/log'),
              icon: const Icon(Icons.add_location_alt),
              label: const Text('Log Visit'),
            )
          : null,
    );
  }

  Widget _buildBody(FieldShiftState shiftState) {
    final colorScheme = Theme.of(context).colorScheme;
    final shift = shiftState.localShift;

    if (shift == null || shift.status == LocalShiftStatus.completed) {
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
                    Text(
                      shift.status == LocalShiftStatus.endingPending
                          ? 'Shift Ending…'
                          : 'Shift Active',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
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
                if (shift.serverShiftId != null)
                  const _InfoRow(label: 'Sync', value: 'Synced to server'),
                if (shift.serverShiftId == null)
                  const _InfoRow(
                      label: 'Sync',
                      value: 'Local only — will sync when online'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Sync health card
        _SyncStatusCard(shiftState: shiftState),
        const SizedBox(height: 12),

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
                    ? const Text('Points saved locally, syncing in background')
                    : const Text('Tap to resume location tracking'),
                trailing: running
                    ? null
                    : TextButton(
                        onPressed: () async {
                          final clientShiftId = shift.clientShiftId;
                          await BackgroundLocationService.start(
                              clientShiftId: clientShiftId);
                          setState(() {});
                        },
                        child: const Text('Start'),
                      ),
              ),
            );
          },
        ),
        const SizedBox(height: 24),

        // Actions
        if (shift.status != LocalShiftStatus.endingPending)
          FilledButton.icon(
            onPressed: _actionPending ? null : _endShift,
            style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error),
            icon: _actionPending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.stop_circle_outlined),
            label: const Text('End Shift'),
          ),

        if (shift.status == LocalShiftStatus.endingPending)
          Card(
            child: ListTile(
              leading: const CircularProgressIndicator(),
              title: const Text('Ending shift…'),
              subtitle: const Text('Syncing remaining data to server'),
              trailing: TextButton(
                onPressed: () =>
                    ref.read(fieldShiftControllerProvider.notifier).retrySync(),
                child: const Text('Retry'),
              ),
            ),
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

// ── sync status card ──────────────────────────────────────────────────────────

class _SyncStatusCard extends StatelessWidget {
  const _SyncStatusCard({required this.shiftState});
  final FieldShiftState shiftState;

  @override
  Widget build(BuildContext context) {
    final pending = shiftState.pendingPointCount;
    final error = shiftState.lastError;

    if (error != null) {
      return Card(
        color: Theme.of(context).colorScheme.errorContainer,
        child: ListTile(
          leading: const Icon(Icons.sync_problem, color: Colors.red),
          title: const Text('Sync error'),
          subtitle: Text(error),
        ),
      );
    }

    if (pending > 0) {
      return Card(
        child: ListTile(
          leading: const Icon(Icons.cloud_upload_outlined,
              color: Colors.orange),
          title: Text('$pending point${pending == 1 ? '' : 's'} pending upload'),
          subtitle: const Text('Will sync when network is available'),
        ),
      );
    }

    if (shiftState.isSynced) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.cloud_done, color: Colors.green),
          title: Text('All points synced'),
        ),
      );
    }

    return const Card(
      child: ListTile(
        leading: Icon(Icons.cloud_off, color: Colors.grey),
        title: Text('Offline — data saved locally'),
        subtitle: Text('Shift will sync when network returns'),
      ),
    );
  }
}

// ── info row ──────────────────────────────────────────────────────────────────

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
