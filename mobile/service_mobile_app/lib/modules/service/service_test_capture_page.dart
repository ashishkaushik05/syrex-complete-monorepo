import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/errors/app_error.dart';
import '../../core/widgets/async_state_views.dart';
import 'controllers/service_controllers.dart';
import 'models/service_models.dart';
import 'repository/service_repository.dart';

class ServiceTestCapturePage extends ConsumerStatefulWidget {
  const ServiceTestCapturePage({super.key, required this.complaintId});

  final String complaintId;

  @override
  ConsumerState<ServiceTestCapturePage> createState() =>
      _ServiceTestCapturePageState();
}

class _ServiceTestCapturePageState
    extends ConsumerState<ServiceTestCapturePage> {
  final _picker = ImagePicker();
  final _values = <String, String>{};
  final _images = <XFile>[];
  final _uploaded = <String, String>{};
  final _summary = TextEditingController();
  FormTemplate? _template;
  String _verdict = 'tested_ok';
  bool _busy = false;
  bool _formSubmitted = false;
  bool _reportSubmitted = false;
  AppError? _error;

  @override
  void dispose() {
    _summary.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final templates = ref.watch(_templatesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Diagnostic and test')),
      body: templates.when(
        loading: () => const LoadingView(label: 'Loading form templates...'),
        error: (error, _) => ErrorView(
          error: AppError.from(error),
          onRetry: () => ref.invalidate(_templatesProvider),
        ),
        data: (items) => _body(items),
      ),
    );
  }

  Widget _body(List<FormTemplate> templates) {
    if (templates.isEmpty) {
      return const EmptyView(
        message: 'No active diagnostic form template is available.',
      );
    }
    _template ??= templates.first;
    final errors = validateForm(_template!, _values);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DropdownButtonFormField<FormTemplate>(
          key: const Key('templateSelector'),
          value: _template,
          decoration: const InputDecoration(
            labelText: 'Diagnostic template',
            border: OutlineInputBorder(),
          ),
          items: templates
              .map((template) => DropdownMenuItem(
                    value: template,
                    child: Text(template.name),
                  ))
              .toList(),
          onChanged: _formSubmitted
              ? null
              : (value) => setState(() {
                    _template = value;
                    _values.clear();
                  }),
        ),
        const SizedBox(height: 16),
        for (final field in _template!.fields) ...[
          _field(field, errors[field.key]),
          const SizedBox(height: 12),
        ],
        Text(
          'Required photographic evidence',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              key: const Key('cameraButton'),
              onPressed: _formSubmitted || _images.length >= 5
                  ? null
                  : () => _pick(ImageSource.camera),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Camera'),
            ),
            OutlinedButton.icon(
              key: const Key('galleryButton'),
              onPressed: _formSubmitted || _images.length >= 5
                  ? null
                  : () => _pick(ImageSource.gallery),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Gallery'),
            ),
          ],
        ),
        if (_images.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('Add 1 to 5 images before submitting.'),
          )
        else
          SizedBox(
            height: 120,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: _images
                  .map((image) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Stack(
                          children: [
                            Image.file(
                              File(image.path),
                              width: 120,
                              height: 120,
                              fit: BoxFit.cover,
                            ),
                            Positioned(
                              right: 0,
                              child: IconButton.filled(
                                tooltip: 'Remove image',
                                onPressed:
                                    _formSubmitted ? null : () => _remove(image),
                                icon: const Icon(Icons.close),
                              ),
                            ),
                          ],
                        ),
                      ))
                  .toList(),
            ),
          ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          key: const Key('verdictSelector'),
          value: _verdict,
          decoration: const InputDecoration(
            labelText: 'Test verdict',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'tested_ok', child: Text('Tested OK')),
            DropdownMenuItem(
              value: 'warranty_candidate',
              child: Text('Warranty candidate'),
            ),
            DropdownMenuItem(value: 'failed', child: Text('Failed')),
            DropdownMenuItem(
              value: 'needs_retest',
              child: Text('Needs retest'),
            ),
          ],
          onChanged: _reportSubmitted
              ? null
              : (value) => setState(() => _verdict = value!),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('testSummaryField'),
          controller: _summary,
          minLines: 2,
          maxLines: 5,
          enabled: !_reportSubmitted,
          decoration: const InputDecoration(
            labelText: 'Test summary',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!.message,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
        if (_busy) ...[
          const SizedBox(height: 12),
          const LinearProgressIndicator(),
          const Text('Uploading and submitting. Keep the app open.'),
        ],
        const SizedBox(height: 16),
        if (!_reportSubmitted)
          FilledButton(
            key: const Key('submitDiagnosticButton'),
            onPressed: _busy ? null : _submit,
            child: Text(_error == null ? 'Submit form and test' : 'Retry'),
          ),
        if (_reportSubmitted && _verdict == 'tested_ok')
          FilledButton.icon(
            key: const Key('closeAfterTestButton'),
            onPressed: _busy ? null : _close,
            icon: const Icon(Icons.check_circle_outline),
            label: const Text('Close tested OK'),
          ),
        if (_reportSubmitted && _verdict != 'tested_ok')
          FilledButton(
            onPressed: () => context.pop(),
            child: const Text('Return to complaint'),
          ),
      ],
    );
  }

  Widget _field(FormFieldDefinition field, String? error) {
    if (field.type == 'boolean') {
      return Container(
        key: Key('field_${field.key}'),
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).dividerColor),
          borderRadius: BorderRadius.circular(12),
        ),
        child: CheckboxListTile(
          title: Text(field.label),
          subtitle: const Text('Yes / no'),
          value: _values[field.key] == 'true',
          onChanged: _formSubmitted
              ? null
              : (value) => setState(() => _values[field.key] = '$value'),
        ),
      );
    }
    if (field.type == 'select') {
      final options = (field.rules['options'] as List? ?? const [])
          .map((value) => value.toString())
          .toList();
      return DropdownButtonFormField<String>(
        key: Key('field_${field.key}'),
        value: _values[field.key]?.isEmpty == false ? _values[field.key] : null,
        decoration: InputDecoration(
          labelText: field.label,
          helperText: 'Select one option',
          errorText: error,
          border: const OutlineInputBorder(),
        ),
        items: options
            .map((option) => DropdownMenuItem(
                  value: option,
                  child: Text(option),
                ))
            .toList(),
        onChanged: _formSubmitted
            ? null
            : (value) => setState(() => _values[field.key] = value ?? ''),
      );
    }
    if (field.type == 'multiselect') {
      final options = (field.rules['options'] as List? ?? const [])
          .map((value) => value.toString())
          .toList();
      Set<String> selected;
      try {
        selected = ((jsonDecode(_values[field.key] ?? '[]')) as List)
            .map((value) => value.toString())
            .toSet();
      } catch (_) {
        selected = <String>{};
      }
      return InputDecorator(
        key: Key('field_${field.key}'),
        decoration: InputDecoration(
          labelText: field.label,
          helperText: 'Select one or more options',
          errorText: error,
          border: const OutlineInputBorder(),
        ),
        child: Wrap(
          spacing: 8,
          children: options
              .map((option) => FilterChip(
                    label: Text(option),
                    selected: selected.contains(option),
                    onSelected: _formSubmitted
                        ? null
                        : (enabled) {
                            setState(() {
                              enabled
                                  ? selected.add(option)
                                  : selected.remove(option);
                              _values[field.key] = jsonEncode(selected.toList());
                            });
                          },
                  ))
              .toList(),
        ),
      );
    }
    if (field.type == 'date') {
      final raw = _values[field.key];
      final parsed = raw != null ? DateTime.tryParse(raw) : null;
      final display = parsed != null
          ? '${parsed.day.toString().padLeft(2, '0')}/'
              '${parsed.month.toString().padLeft(2, '0')}/'
              '${parsed.year}'
          : '';
      return InputDecorator(
        key: Key('field_${field.key}'),
        decoration: InputDecoration(
          labelText: field.label,
          helperText: 'Pick a calendar date',
          errorText: error,
          border: const OutlineInputBorder(),
          suffixIcon: const Icon(Icons.calendar_month_outlined),
        ),
        child: InkWell(
          onTap: _formSubmitted
              ? null
              : () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: parsed ?? now,
                    firstDate: DateTime(now.year - 10),
                    lastDate: DateTime(now.year + 10),
                  );
                  if (picked != null) {
                    setState(() {
                      _values[field.key] =
                          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                    });
                  }
                },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              display.isEmpty ? 'Select date' : display,
              style: display.isEmpty
                  ? TextStyle(color: Theme.of(context).hintColor)
                  : null,
            ),
          ),
        ),
      );
    }
    return TextFormField(
      key: Key('field_${field.key}'),
      initialValue: _values[field.key],
      enabled: !_formSubmitted,
      keyboardType: switch (field.type) {
        'number' => TextInputType.number,
        'decimal' => const TextInputType.numberWithOptions(decimal: true),
        'email' => TextInputType.emailAddress,
        'phone' => TextInputType.phone,
        'url' => TextInputType.url,
        'textarea' => TextInputType.multiline,
        _ => TextInputType.text,
      },
      minLines: field.type == 'textarea' ? 3 : 1,
      maxLines: field.type == 'textarea' ? 6 : 1,
      decoration: InputDecoration(
        labelText: field.label,
        helperText: switch (field.type) {
          'number' => 'Enter a whole number',
          'decimal' => 'Enter a decimal number',
          'email' => 'Enter an email address',
          'phone' => 'Enter a phone number',
          'url' => 'Enter a web address',
          'textarea' => 'Use the larger text area for notes',
          _ => null,
        },
        errorText: error,
        border: const OutlineInputBorder(),
        prefixIcon: switch (field.type) {
          'email' => const Icon(Icons.email_outlined),
          'phone' => const Icon(Icons.phone_outlined),
          'url' => const Icon(Icons.link_outlined),
          _ => null,
        },
      ),
      onChanged: (value) => _values[field.key] = value,
    );
  }

  Future<void> _pick(ImageSource source) async {
    final image = await _picker.pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 2200,
    );
    if (image != null && mounted) setState(() => _images.add(image));
  }

  Future<void> _remove(XFile image) async {
    final attachmentId = _uploaded[image.path];
    if (attachmentId != null) {
      try {
        await ref
            .read(serviceRepositoryProvider)
            .removeStagedEvidence(attachmentId);
      } catch (error) {
        if (!mounted) return;
        setState(() => _error = AppError.from(error));
      }
    }
    if (!mounted) return;
    setState(() {
      _uploaded.remove(image.path);
      _images.remove(image);
    });
  }

  Future<void> _submit() async {
    final errors = validateForm(_template!, _values);
    if (errors.isNotEmpty || _images.isEmpty || _images.length > 5) {
      setState(() {
        _error = const AppError(
          AppErrorType.validation,
          'Complete required fields and add 1 to 5 images.',
        );
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    final repository = ref.read(serviceRepositoryProvider);
    try {
      if (!_formSubmitted) {
        for (final image in _images) {
          _uploaded[image.path] ??=
              await repository.uploadEvidence(widget.complaintId, image);
        }
        await repository.submitForm(
          complaintId: widget.complaintId,
          templateId: _template!.id,
          values: _values,
          attachmentIds: _images.map((image) => _uploaded[image.path]!).toList(),
        );
        _formSubmitted = true;
      }
      await repository.submitTest(
        complaintId: widget.complaintId,
        verdict: _verdict,
        summary: _summary.text,
      );
      _reportSubmitted = true;
      ref.invalidate(complaintBundleProvider(widget.complaintId));
      await ref.read(queueControllerProvider.notifier).refresh();
    } catch (error) {
      _error = AppError.from(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _close() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(serviceRepositoryProvider)
          .closeTestedOk(widget.complaintId);
      ref.invalidate(complaintBundleProvider(widget.complaintId));
      await ref.read(queueControllerProvider.notifier).refresh();
      if (mounted) context.pop();
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = AppError.from(error);
        });
      }
    }
  }
}

final _templatesProvider = FutureProvider<List<FormTemplate>>((ref) {
  return ref.watch(serviceRepositoryProvider).templates();
});
