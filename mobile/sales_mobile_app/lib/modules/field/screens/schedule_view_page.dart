import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/premium_surfaces.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

class ScheduleViewPage extends ConsumerStatefulWidget {
  const ScheduleViewPage({super.key});

  @override
  ConsumerState<ScheduleViewPage> createState() => _ScheduleViewPageState();
}

class _ScheduleViewPageState extends ConsumerState<ScheduleViewPage> {
  bool _saving = false;
  String? _message;

  Future<void> _pickTime(String? current, bool isEnabled) async {
    TimeOfDay initial = TimeOfDay.now();
    if (current != null) {
      final parts = current.split(':');
      if (parts.length == 2) {
        initial = TimeOfDay(
          hour: int.tryParse(parts[0]) ?? 0,
          minute: int.tryParse(parts[1]) ?? 0,
        );
      }
    }

    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      helpText: 'Auto-start time (24-hr)',
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;

    final hh = picked.hour.toString().padLeft(2, '0');
    final mm = picked.minute.toString().padLeft(2, '0');
    await _save(autoStartTime: '$hh:$mm', isEnabled: isEnabled);
  }

  Future<void> _toggleEnabled(String autoStartTime, bool newValue) async {
    await _save(autoStartTime: autoStartTime, isEnabled: newValue);
  }

  Future<void> _save({required String autoStartTime, required bool isEnabled}) async {
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await ref.read(fieldRepositoryProvider).upsertMySchedule(
            autoStartTime: autoStartTime,
            isEnabled: isEnabled,
          );
      ref.invalidate(myScheduleProvider);
      setState(() => _message = 'Schedule saved.');
    } catch (e) {
      setState(() => _message = 'Save failed. Please retry.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheduleAsync = ref.watch(myScheduleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shift Schedule'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppPalette.ink,
      ),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            if (_message != null)
              InlineBanner(
                message: _message!,
                type: _message!.contains('failed') ? BannerType.warning : BannerType.success,
              ),
            scheduleAsync.when(
              loading: () => const PremiumCard(child: LinearProgressIndicator()),
              error: (_, __) => const PremiumCard(
                child: EmptyStateView(
                  title: 'Could not load schedule',
                  subtitle: 'Pull to refresh and try again.',
                  icon: Icons.schedule,
                ),
              ),
              data: (schedule) {
                if (schedule == null) {
                  return Column(
                    children: [
                      const PremiumCard(
                        child: EmptyStateView(
                          title: 'No schedule set',
                          subtitle: 'Tap below to configure an auto-start time for your shift.',
                          icon: Icons.alarm_off_outlined,
                        ),
                      ),
                      FilledButton.icon(
                        onPressed: _saving ? null : () => _pickTime(null, true),
                        icon: const Icon(Icons.add_alarm_rounded),
                        label: const Text('Set Auto-Start Time'),
                      ),
                    ],
                  );
                }

                return PremiumCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Auto-Start',
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                          ),
                          Switch(
                            value: schedule.isEnabled,
                            onChanged: _saving
                                ? null
                                : (v) => _toggleEnabled(schedule.autoStartTime, v),
                            activeColor: AppPalette.mint,
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        schedule.isEnabled ? 'Enabled' : 'Disabled',
                        style: TextStyle(
                          color: schedule.isEnabled ? AppPalette.mint : const Color(0xFF8A9BAA),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 16),
                      _InfoRow(
                        label: 'Auto-start at',
                        value: schedule.autoStartTime,
                        icon: Icons.access_time_rounded,
                      ),
                      const SizedBox(height: 8),
                      _InfoRow(
                        label: 'Timezone',
                        value: schedule.timezone,
                        icon: Icons.public_rounded,
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _saving
                              ? null
                              : () => _pickTime(schedule.autoStartTime, schedule.isEnabled),
                          icon: _saving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.edit_rounded),
                          label: const Text('Change Time'),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            const PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'How auto-start works',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'At your configured time each day, the system automatically opens a shift on your behalf. '
                    'The shift starts within a ±2 minute window. If a shift is already active or one was '
                    'opened today, auto-start is skipped.',
                    style: TextStyle(color: Color(0xFF5A6A77), fontSize: 13, height: 1.5),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value, required this.icon});

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppPalette.ocean),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(color: Color(0xFF5A6A77), fontSize: 13),
        ),
        const Spacer(),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ],
    );
  }
}
