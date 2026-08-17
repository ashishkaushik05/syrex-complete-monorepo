import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/api/service_client.dart';
import '../../core/models/service_complaint.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/app_button.dart';
import '../../app/theme_provider.dart';

class RaiseComplaintScreen extends ConsumerStatefulWidget {
  const RaiseComplaintScreen({super.key});

  @override
  ConsumerState<RaiseComplaintScreen> createState() => _RaiseComplaintScreenState();
}

class _RaiseComplaintScreenState extends ConsumerState<RaiseComplaintScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _customerNameCtrl = TextEditingController();
  final _customerPhoneCtrl = TextEditingController();
  final _serialCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _customerNameCtrl.dispose();
    _customerPhoneCtrl.dispose();
    _serialCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final desc = _descCtrl.text.trim();
    final title = _titleCtrl.text.trim();
    if (desc.isEmpty && title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter at least a title or description.')),
      );
      return;
    }
    final phone = _customerPhoneCtrl.text.trim();
    if (phone.isNotEmpty && phone.length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Phone number must be at least 5 digits.')),
      );
      return;
    }
    final serial = _serialCtrl.text.trim();
    if (serial.isNotEmpty && serial.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Serial number must be at least 2 characters.')),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      final lines = <CreateComplaintLineInput>[];
      if (serial.isNotEmpty) {
        lines.add(CreateComplaintLineInput(serialNumber: serial));
      }
      await ref.read(serviceClientProvider).createComplaint(
            CreateComplaintInput(
              title: title.isEmpty ? null : title,
              description: desc.isEmpty ? null : desc,
              customerName: _customerNameCtrl.text.trim().isEmpty ? null : _customerNameCtrl.text.trim(),
              customerPhone: _customerPhoneCtrl.text.trim().isEmpty ? null : _customerPhoneCtrl.text.trim(),
              lines: lines,
            ),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Complaint submitted successfully.')),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to submit: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);

    return Scaffold(
      backgroundColor: c.bg,
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              OutletAppBar(title: 'Raise complaint', c: c, showBack: true),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _FieldGroup(title: 'Issue', c: c, children: [
                      _Field(label: 'Title', controller: _titleCtrl, c: c, hint: 'Brief description'),
                      const SizedBox(height: 12),
                      _Field(label: 'Details', controller: _descCtrl, c: c, hint: 'Full issue description', maxLines: 4),
                    ]),
                    const SizedBox(height: 16),
                    _FieldGroup(title: 'Customer (optional)', c: c, children: [
                      _Field(label: 'Customer name', controller: _customerNameCtrl, c: c),
                      const SizedBox(height: 12),
                      _Field(label: 'Phone', controller: _customerPhoneCtrl, c: c, keyboardType: TextInputType.phone),
                    ]),
                    const SizedBox(height: 16),
                    _FieldGroup(title: 'Unit (optional)', c: c, children: [
                      _Field(label: 'Serial number', controller: _serialCtrl, c: c, hint: 'e.g. SRX12345678'),
                    ]),
                    const SizedBox(height: 28),
                    AppButton(
                      label: 'Submit complaint',
                      c: c,
                      fullWidth: true,
                      loading: _loading,
                      onTap: _loading ? null : _submit,
                      size: AppButtonSize.lg,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FieldGroup extends StatelessWidget {
  final String title;
  final List<Widget> children;
  final AppThemeColors c;
  const _FieldGroup({required this.title, required this.children, required this.c});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(title.toUpperCase(),
              style: AppTextStyles.caption(color: c.textFaint)
                  .copyWith(letterSpacing: 0.5, fontWeight: FontWeight.w700)),
        ),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: c.line),
            boxShadow: [c.shadow],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final AppThemeColors c;
  final String? hint;
  final int maxLines;
  final TextInputType keyboardType;
  const _Field({
    required this.label,
    required this.controller,
    required this.c,
    this.hint,
    this.maxLines = 1,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTextStyles.smallLabelBold(color: c.textMute)),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboardType,
          style: AppTextStyles.label(color: c.text),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: AppTextStyles.label(color: c.textFaint),
            filled: true,
            fillColor: c.sunken,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
          ),
        ),
      ],
    );
  }
}
