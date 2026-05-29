import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/widgets/rb_button.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';
import 'package:outlet_owner_template/core/widgets/rb_chip.dart';
import 'package:outlet_owner_template/core/widgets/rb_text_field.dart';
import 'package:outlet_owner_template/core/widgets/rb_top_bar.dart';
import 'package:outlet_owner_template/core/api/field_client.dart';

class VisitLogScreen extends ConsumerStatefulWidget {
  final VoidCallback? onBack;
  final void Function(String)? onNav;

  const VisitLogScreen({
    super.key,
    this.onBack,
    this.onNav,
  });

  @override
  ConsumerState<VisitLogScreen> createState() => _VisitLogScreenState();
}

class _VisitLogScreenState extends ConsumerState<VisitLogScreen> {
  String? _selectedOutlet;
  String _selectedVisitType = 'Delivery';
  final _notesController = TextEditingController();

  final _outlets = [
    'Metro Mart Downtown',
    'Fresh Foods',
    'City Store',
    'Quick Shop',
    'Mega Retail',
  ];

  final _visitTypes = ['Delivery', 'Collection', 'Survey', 'Service'];

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  void _logVisit(WidgetRef ref) async {
    if (_selectedOutlet == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an outlet')),
      );
      return;
    }

    try {
      final fieldClient = ref.read(fieldClientProvider);
      final activeShift = ref.read(activeShiftProvider).value;

      await fieldClient.logVisit(
        outletId: _selectedOutlet!,
        visitType: _selectedVisitType.toLowerCase(),
        notes: _notesController.text.isEmpty ? null : _notesController.text,
        shiftId: activeShift?.id,
      );

      // Reset form
      setState(() {
        _selectedOutlet = null;
        _selectedVisitType = 'Delivery';
        _notesController.clear();
      });

      // Invalidate visits provider to refresh
      ref.invalidate(shiftVisitsProvider);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Visit logged to $_selectedOutlet'),
            backgroundColor: Colors.green,
          ),
        );
        widget.onBack?.call();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return Scaffold(
      body: Column(
        children: [
          RbTopBar(
            title: 'Log visit',
            leading: widget.onBack != null
                ? GestureDetector(
                    onTap: widget.onBack,
                    child:
                        RbIcon('chev-left', size: AppSpacing.iconLg, color: cs.ink),
                  )
                : null,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.pad,
                AppSpacing.pad,
                AppSpacing.pad,
                AppSpacing.pad,
              ),
              children: [
                // Outlet selector
                Text(
                  'Outlet',
                  style: GoogleFonts.geist(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: cs.ink2,
                  ),
                ),
                const SizedBox(height: 8),
                RbCard(
                  onTap: () => _showOutletPicker(context, cs),
                  padding: const EdgeInsets.all(AppSpacing.pad),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _selectedOutlet ?? 'Select outlet',
                        style: GoogleFonts.geist(
                          fontSize: 14,
                          color: _selectedOutlet != null ? cs.ink : cs.muted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      RbIcon('chev-right',
                          size: AppSpacing.iconMd, color: cs.muted),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Visit type
                Text(
                  'Visit type',
                  style: GoogleFonts.geist(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: cs.ink2,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _visitTypes.map((type) {
                    final isSelected = _selectedVisitType == type;
                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          _selectedVisitType = type;
                        });
                      },
                      child: RbChip(
                        label: type,
                        variant: isSelected
                            ? RbChipVariant.accent
                            : RbChipVariant.neutral,
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 20),

                // Notes
                RbTextField(
                  controller: _notesController,
                  label: 'Notes',
                  placeholder: 'Add any notes about this visit',
                  keyboardType: TextInputType.multiline,
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
          // Sticky bottom button
          Container(
            padding: const EdgeInsets.all(AppSpacing.pad),
            decoration: BoxDecoration(
              color: cs.bg,
              border: Border(
                  top: BorderSide(color: cs.line, width: AppSpacing.hairline)),
            ),
            child: SafeArea(
              top: false,
              child: Consumer(
                builder: (context, ref, child) {
                  return RbButton(
                    label: 'Log visit',
                    onPressed: () => _logVisit(ref),
                    fullWidth: true,
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showOutletPicker(BuildContext context, AppColorScheme cs) {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(AppSpacing.pad),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Select outlet',
                style: GoogleFonts.geist(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: cs.ink,
                ),
              ),
              const SizedBox(height: 16),
              ListView.builder(
                shrinkWrap: true,
                itemCount: _outlets.length,
                itemBuilder: (context, index) {
                  final outlet = _outlets[index];
                  return Material(
                    child: InkWell(
                      onTap: () {
                        setState(() {
                          _selectedOutlet = outlet;
                        });
                        Navigator.pop(context);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            vertical: AppSpacing.padSm),
                        child: Text(
                          outlet,
                          style: GoogleFonts.geist(fontSize: 14, color: cs.ink),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}
