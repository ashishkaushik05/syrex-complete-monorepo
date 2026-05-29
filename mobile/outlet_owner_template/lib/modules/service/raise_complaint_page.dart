import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/service_complaints_client.dart';
import '../../core/outlet/outlet_context.dart';

class RaiseComplaintPage extends ConsumerStatefulWidget {
  const RaiseComplaintPage({super.key});

  @override
  ConsumerState<RaiseComplaintPage> createState() => _RaiseComplaintPageState();
}

class _RaiseComplaintPageState extends ConsumerState<RaiseComplaintPage> {
  final _formKey = GlobalKey<FormState>();
  final _descriptionCtrl = TextEditingController();
  final _skuCtrl = TextEditingController();
  final _serialCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    _skuCtrl.dispose();
    _serialCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final outletId = ref.read(outletIdProvider);
    if (outletId == null) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final lines = <ComplaintLineInput>[
        ComplaintLineInput(
          sku: _skuCtrl.text.trim().isEmpty ? null : _skuCtrl.text.trim(),
          description: _descriptionCtrl.text.trim(),
          serialNumber:
              _serialCtrl.text.trim().isEmpty ? null : _serialCtrl.text.trim(),
        ),
      ];

      await ref.read(serviceComplaintsClientProvider).create(
            outletId: outletId,
            description: _descriptionCtrl.text.trim(),
            lines: lines,
          );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Complaint raised successfully.')),
        );
        context.pop();
      }
    } catch (e) {
      setState(() {
        _submitting = false;
        _error = 'Could not raise complaint. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Raise Complaint')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Describe the issue',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _descriptionCtrl,
              decoration: const InputDecoration(
                labelText: 'Description *',
                hintText: 'Describe the problem in detail',
              ),
              maxLines: 4,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 20),
            Text(
              'Product Details (optional)',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _skuCtrl,
              decoration: const InputDecoration(labelText: 'Product SKU'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _serialCtrl,
              decoration: const InputDecoration(labelText: 'Serial Number'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Submit Complaint'),
            ),
          ],
        ),
      ),
    );
  }
}
