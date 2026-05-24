import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/session_controller.dart';
import '../../../core/permissions/permission_service.dart';
import '../../../shared/widgets/premium_surfaces.dart';
import '../models/field_models.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends ConsumerState<AttendancePage> {
  bool _marking = false;
  bool _patching = false;
  String? _banner;
  String? _selectedAgentId;
  AttendanceStatus? _selectedStatus;

  Future<void> _mark(AttendanceStatus status) async {
    setState(() {
      _marking = true;
      _banner = null;
    });
    try {
      await ref.read(fieldRepositoryProvider).markAttendance(status: status);
      ref.invalidate(todayAttendanceProvider);
      setState(() => _banner = 'Attendance marked as ${status.label}.');
    } catch (_) {
      setState(() => _banner = 'Could not mark attendance. Retry shortly.');
    } finally {
      if (mounted) setState(() => _marking = false);
    }
  }

  Future<void> _patchRecord(AttendanceRecord record) async {
    final noteCtrl = TextEditingController(text: record.note ?? '');
    AttendanceStatus picked = record.status;

    final ok = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Edit Attendance'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<AttendanceStatus>(
                value: picked,
                items: AttendanceStatus.values
                    .map((status) => DropdownMenuItem(value: status, child: Text(status.label)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) picked = v;
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: noteCtrl,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Note'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
          ],
        );
      },
    );

    if (ok != true) return;

    setState(() => _patching = true);
    try {
      await ref.read(fieldRepositoryProvider).patchAttendance(
            id: record.id,
            status: picked,
            note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
          );
      final now = DateTime.now().toLocal();
      final from = now.subtract(const Duration(days: 30)).toIso8601String().substring(0, 10);
      final to = now.toIso8601String().substring(0, 10);
      ref.invalidate(attendanceAdminProvider((
        userId: _selectedAgentId,
        from: from,
        to: to,
        status: _selectedStatus?.apiValue,
      )));
      setState(() => _banner = 'Attendance updated.');
    } catch (_) {
      setState(() => _banner = 'Could not update attendance record.');
    } finally {
      if (mounted) setState(() => _patching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionControllerProvider).user;
    final canAdmin = user != null &&
        ref.watch(permissionServiceProvider).can(user, 'field:admin');
    final historyAsync = ref.watch(todayAttendanceProvider);
    final agentsAsync = ref.watch(agentsProvider);
    final now = DateTime.now().toLocal();
    final from = now.subtract(const Duration(days: 30)).toIso8601String().substring(0, 10);
    final to = now.toIso8601String().substring(0, 10);
    final adminAsync = ref.watch(attendanceAdminProvider((
      userId: _selectedAgentId,
      from: from,
      to: to,
      status: _selectedStatus?.apiValue,
    )));

    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            if (_banner != null)
              InlineBanner(
                message: _banner!,
                type: _banner!.contains('updated') || _banner!.contains('marked')
                    ? BannerType.success
                    : BannerType.error,
              ),
            PremiumCard(
              child: historyAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Unable to load attendance history.'),
                data: (records) {
                  final today = DateTime.now().toIso8601String().split('T').first;
                  final todayRecord = records.where((r) => r.date == today).firstOrNull;

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Today', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 10),
                      if (todayRecord != null)
                        Row(
                          children: [
                            StateBadge(label: todayRecord.status.label, color: _statusColor(todayRecord.status)),
                            const SizedBox(width: 8),
                            Expanded(child: Text(todayRecord.note ?? 'Marked for today')),
                          ],
                        )
                      else
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: AttendanceStatus.values
                              .map(
                                (status) => FilledButton.tonal(
                                  onPressed: _marking ? null : () => _mark(status),
                                  child: Text(status.label),
                                ),
                              )
                              .toList(),
                        ),
                      const SizedBox(height: 14),
                      const Text('Last 30 days', style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      if (records.isEmpty)
                        const EmptyStateView(
                          title: 'No attendance records',
                          subtitle: 'Your attendance marks will appear here.',
                          icon: Icons.event_busy_outlined,
                        )
                      else
                        ...records
                            .where((r) => r.date != today)
                            .map(
                              (record) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                dense: true,
                                leading: Icon(Icons.circle, size: 10, color: _statusColor(record.status)),
                                title: Text(record.date),
                                subtitle: record.note == null ? null : Text(record.note!),
                                trailing: StateBadge(label: record.status.label, color: _statusColor(record.status)),
                              ),
                            ),
                    ],
                  );
                },
              ),
            ),
            if (canAdmin)
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Admin View', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 10),
                    agentsAsync.when(
                      loading: () => const LinearProgressIndicator(),
                      error: (_, __) => const Text('Unable to load agents'),
                      data: (agents) => DropdownButtonFormField<String?>(
                        value: _selectedAgentId,
                        decoration: const InputDecoration(labelText: 'Agent filter'),
                        items: [
                          const DropdownMenuItem<String?>(value: null, child: Text('All agents')),
                          ...agents.map(
                            (agent) => DropdownMenuItem<String?>(
                              value: agent.id,
                              child: Text(agent.name),
                            ),
                          ),
                        ],
                        onChanged: (value) => setState(() => _selectedAgentId = value),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      children: [
                        FilterChip(
                          label: const Text('All'),
                          selected: _selectedStatus == null,
                          onSelected: (_) => setState(() => _selectedStatus = null),
                        ),
                        ...AttendanceStatus.values.map(
                          (status) => FilterChip(
                            label: Text(status.label),
                            selected: _selectedStatus == status,
                            onSelected: (_) => setState(() => _selectedStatus = status),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    adminAsync.when(
                      loading: () => const LinearProgressIndicator(),
                      error: (_, __) => const Text('Unable to load filtered attendance'),
                      data: (records) {
                        if (records.isEmpty) {
                          return const EmptyStateView(
                            title: 'No matching records',
                            subtitle: 'Try a different filter window.',
                            icon: Icons.filter_alt_off,
                          );
                        }
                        return Column(
                          children: records
                              .map(
                                (record) => ListTile(
                                  dense: true,
                                  contentPadding: EdgeInsets.zero,
                                  title: Text('${record.userName ?? record.userId} · ${record.date}'),
                                  subtitle: Text(record.note ?? '-'),
                                  trailing: _patching
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : TextButton(
                                          onPressed: () => _patchRecord(record),
                                          child: const Text('Edit'),
                                        ),
                                ),
                              )
                              .toList(),
                        );
                      },
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(AttendanceStatus status) {
    return switch (status) {
      AttendanceStatus.present => AppPalette.mint,
      AttendanceStatus.absent => AppPalette.rose,
      AttendanceStatus.halfDay => AppPalette.amber,
      AttendanceStatus.leave => AppPalette.info,
    };
  }
}
