import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/attendance.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  bool _marking = false;

  Future<void> _markAttendance(AttendanceStatus status) async {
    setState(() => _marking = true);
    try {
      await ref.read(fieldRepositoryProvider).markAttendance(status: status);
      ref.invalidate(attendanceHistoryProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text('Attendance marked as ${status.label}')),
        );
      }
    } catch (e) {
      if (mounted) {
        final msg = e.toString();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(msg.contains('already marked')
                  ? 'Attendance already marked for today.'
                  : 'Failed to mark attendance. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _marking = false);
    }
  }

  Color _statusColor(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.present:
        return Colors.green;
      case AttendanceStatus.absent:
        return Colors.red;
      case AttendanceStatus.halfDay:
        return Colors.orange;
      case AttendanceStatus.leave:
        return Colors.blue;
    }
  }

  IconData _statusIcon(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.present:
        return Icons.check_circle;
      case AttendanceStatus.absent:
        return Icons.cancel;
      case AttendanceStatus.halfDay:
        return Icons.timelapse;
      case AttendanceStatus.leave:
        return Icons.beach_access;
    }
  }

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(attendanceHistoryProvider);
    final today = DateTime.now().toIso8601String().split('T')[0];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(attendanceHistoryProvider),
          ),
        ],
      ),
      body: historyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              const Text('Could not load attendance history'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(attendanceHistoryProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (records) {
          final todayRecord = records.where((r) => r.date == today).firstOrNull;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Today's status
              Card(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Today — ${_formatDate(today)}",
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 12),
                      if (todayRecord != null)
                        Row(
                          children: [
                            Icon(_statusIcon(todayRecord.status),
                                color: _statusColor(todayRecord.status)),
                            const SizedBox(width: 8),
                            Text(todayRecord.status.label,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyLarge
                                    ?.copyWith(
                                        fontWeight: FontWeight.bold,
                                        color: _statusColor(todayRecord.status))),
                          ],
                        )
                      else ...[
                        Text('Not marked yet',
                            style:
                                Theme.of(context).textTheme.bodyMedium),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: AttendanceStatus.values.map((status) {
                            return FilledButton.tonal(
                              onPressed:
                                  _marking ? null : () => _markAttendance(status),
                              style: FilledButton.styleFrom(
                                backgroundColor:
                                    _statusColor(status).withOpacity(0.15),
                                foregroundColor: _statusColor(status),
                              ),
                              child: _marking
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2))
                                  : Text(status.label),
                            );
                          }).toList(),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),
              Text('Last 30 Days',
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),

              if (records.isEmpty)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text('No attendance records yet.',
                        style: TextStyle(color: Colors.grey)),
                  ),
                )
              else
                ...records
                    .where((r) => r.date != today)
                    .toList()
                    .reversed
                    .map(
                      (record) => ListTile(
                        leading: Icon(
                          _statusIcon(record.status),
                          color: _statusColor(record.status),
                        ),
                        title: Text(_formatDate(record.date)),
                        subtitle:
                            record.note != null ? Text(record.note!) : null,
                        trailing: Chip(
                          label: Text(record.status.label,
                              style: const TextStyle(fontSize: 12)),
                          backgroundColor:
                              _statusColor(record.status).withOpacity(0.12),
                          side: BorderSide.none,
                          padding: EdgeInsets.zero,
                          labelPadding:
                              const EdgeInsets.symmetric(horizontal: 8),
                        ),
                        dense: true,
                      ),
                    ),
            ],
          );
        },
      ),
    );
  }

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return '${days[dt.weekday - 1]}, ${dt.day} ${months[dt.month - 1]}';
  }
}
