import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/config/polling.dart';
import '../../core/errors/app_error.dart';
import '../../core/widgets/async_state_views.dart';
import 'controllers/service_controllers.dart';
import 'models/service_models.dart';
import 'repository/service_repository.dart';

class ServiceDetailPage extends ConsumerStatefulWidget {
  const ServiceDetailPage({super.key, required this.complaintId});

  final String complaintId;

  @override
  ConsumerState<ServiceDetailPage> createState() => _ServiceDetailPageState();
}

class _ServiceDetailPageState extends ConsumerState<ServiceDetailPage>
    with WidgetsBindingObserver {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startPolling();
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(serviceDetailPollInterval, (_) {
      ref.invalidate(complaintBundleProvider(widget.complaintId));
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(complaintBundleProvider(widget.complaintId));
      _startPolling();
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bundle = ref.watch(complaintBundleProvider(widget.complaintId));
    return Scaffold(
      appBar: AppBar(title: const Text('Complaint detail')),
      body: bundle.when(
        loading: () => const LoadingView(label: 'Loading complaint...'),
        error: (error, _) => ErrorView(
          error: AppError.from(error),
          onRetry: () =>
              ref.invalidate(complaintBundleProvider(widget.complaintId)),
        ),
        data: (data) => _DetailBody(
          complaintId: widget.complaintId,
          bundle: data,
        ),
      ),
    );
  }
}

class _DetailBody extends ConsumerStatefulWidget {
  const _DetailBody({required this.complaintId, required this.bundle});

  final String complaintId;
  final ComplaintBundle bundle;

  @override
  ConsumerState<_DetailBody> createState() => _DetailBodyState();
}

class _DetailBodyState extends ConsumerState<_DetailBody> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(complaintBundleProvider(widget.complaintId));
      await ref.read(queueControllerProvider.notifier).refresh();
    } catch (error) {
      if (!mounted) return;
      final mapped = AppError.from(error);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(mapped.message)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = widget.bundle.detail;
    final user = ref.watch(sessionControllerProvider).user!;
    final actions = actionsFor(user, detail);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                detail.number,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            Chip(label: Text(_label(detail.status))),
          ],
        ),
        const SizedBox(height: 12),
        _section(context, 'Customer', [
          Text(detail.customerName ?? 'Name unavailable'),
          Text(detail.customerPhone ?? 'Phone unavailable'),
          Text(detail.description ?? detail.issueCategory),
        ]),
        _section(context, 'Product and serial', [
          for (final line in detail.lines)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(line.sku),
              subtitle: Text(line.serialNumber),
            ),
        ]),
        _section(context, 'Current assignment', [
          Text('ASI: ${detail.assignedAsiName ?? 'Unassigned'}'),
          Text('Service Engineer: ${detail.assignedSeName ?? 'Unassigned'}'),
        ]),
        _section(context, 'Warranty', [
          Text(detail.warrantyStatus == null
              ? 'No warranty decision'
              : _label(detail.warrantyStatus!)),
        ]),
        _section(context, 'Diagnostic forms and evidence', [
          if (widget.bundle.submissions.isEmpty)
            const Text('No submitted forms.')
          else
            for (final submission in widget.bundle.submissions)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.fact_check_outlined),
                title: Text(submission.templateName),
                subtitle: Text(
                  '${submission.evidence.length} evidence image(s)',
                ),
              ),
          if (widget.bundle.stagedEvidence.isNotEmpty)
            Text(
              '${widget.bundle.stagedEvidence.length} staged evidence image(s)',
            ),
        ]),
        _section(context, 'Tests', [
          if (detail.tests.isEmpty)
            const Text('No test reports.')
          else
            for (final test in detail.tests)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(_label(test.verdict)),
                subtitle: Text(test.summary ?? 'No summary'),
              ),
        ]),
        _section(context, 'Activity', [
          if (detail.activities.isEmpty)
            const Text('No activity recorded.')
          else
            for (final activity in detail.activities.take(10))
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(_label(activity.action)),
                subtitle: activity.note == null ? null : Text(activity.note!),
              ),
        ]),
        if (_busy) const LinearProgressIndicator(),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (actions.canAssignEngineer)
              FilledButton.tonalIcon(
                key: const Key('assignEngineerButton'),
                onPressed: _busy ? null : _assignEngineer,
                icon: const Icon(Icons.engineering),
                label: const Text('Assign engineer'),
              ),
            if (actions.canRequestRetest)
              FilledButton.tonalIcon(
                key: const Key('requestRetestButton'),
                onPressed: _busy ? null : _requestRetest,
                icon: const Icon(Icons.replay),
                label: const Text('Request retest'),
              ),
            if (actions.canLogVisit)
              FilledButton.icon(
                key: const Key('logVisitButton'),
                onPressed: _busy
                    ? null
                    : () => _run(() => ref
                        .read(serviceRepositoryProvider)
                        .logVisit(widget.complaintId)),
                icon: const Icon(Icons.location_on_outlined),
                label: const Text('Log visit'),
              ),
            if (actions.canRunDiagnostic)
              FilledButton.icon(
                key: const Key('diagnosticButton'),
                onPressed: _busy
                    ? null
                    : () => context.push(
                          '/service/complaint/${widget.complaintId}/diagnostic',
                        ),
                icon: const Icon(Icons.fact_check),
                label: const Text('Run diagnostic'),
              ),
            if (actions.canCloseTestedOk)
              FilledButton.icon(
                key: const Key('closeTestedOkButton'),
                onPressed: _busy
                    ? null
                    : () => _run(() => ref
                        .read(serviceRepositoryProvider)
                        .closeTestedOk(widget.complaintId)),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Close tested OK'),
              ),
          ],
        ),
      ],
    );
  }

  Widget _section(BuildContext context, String title, List<Widget> children) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }

  Future<void> _assignEngineer() async {
    final repository = ref.read(serviceRepositoryProvider);
    try {
      final engineers = await repository.serviceEngineers();
      if (!mounted) return;
      final selected = await showDialog<String>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Choose active Service Engineer'),
          children: [
            if (engineers.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('No active Service Engineers found.'),
              ),
            for (final engineer in engineers)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(context, engineer.id),
                child: Text(engineer.name),
              ),
          ],
        ),
      );
      if (selected != null) {
        await _run(
            () => repository.assignEngineer(widget.complaintId, selected));
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppError.from(error).message)),
      );
    }
  }

  Future<void> _requestRetest() async {
    final controller = TextEditingController();
    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request retest'),
        content: TextField(
          key: const Key('retestNoteField'),
          controller: controller,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Reason and instructions',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Request'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (note != null && note.length >= 2) {
      await _run(() => ref
          .read(serviceRepositoryProvider)
          .requestRetest(widget.complaintId, note));
    }
  }

  String _label(String value) => value
      .split('_')
      .map((word) =>
          word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');
}
