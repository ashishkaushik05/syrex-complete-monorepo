import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/outlet.dart';
import '../../core/utils/formatters.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/kv_row.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/app_button.dart';
import '../../app/theme_provider.dart';

final _profileProvider = FutureProvider.autoDispose<OutletProfileDto>(
  (ref) => ref.read(outletPortalClientProvider).myProfile(),
);

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final profileAsync = ref.watch(_profileProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: profileAsync.when(
        data: (profile) => _Body(profile: profile, c: c, ref: ref),
        loading: () => _Loading(c: c),
        error: (e, _) => _ErrorState(c: c, ref: ref),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final OutletProfileDto profile;
  final AppThemeColors c;
  final WidgetRef ref;
  const _Body({required this.profile, required this.c, required this.ref});

  bool get _hasBilling =>
      profile.legalName != null ||
      profile.gstin != null ||
      profile.billingAddress1 != null;

  void _openBillingEdit(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BillingEditSheet(profile: profile, c: c, ref: ref),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: OutletAppBar(title: 'Profile', c: c, showBack: true),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // ── Outlet info ─────────────────────────────────
              AppCard(
                c: c,
                child: Column(
                  children: [
                    KVRow(label: 'Outlet name', value: profile.name, c: c),
                    KVRow(label: 'Outlet code', value: profile.outletCode, c: c),
                    KVRow(label: 'Owner', value: profile.ownerName, c: c),
                    KVRow(label: 'Phone', value: profile.phone, c: c),
                    KVRow(label: 'Address', value: profile.address, c: c, last: true),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // ── Credit ───────────────────────────────────────
              AppCard(
                c: c,
                child: Column(
                  children: [
                    KVRow(
                        label: 'Credit limit',
                        value: fmtINR(parseAmount(profile.creditLimit)),
                        c: c),
                    KVRow(
                        label: 'Outstanding balance',
                        value: fmtINR(parseAmount(profile.outstandingBalance)),
                        c: c,
                        valueColor: parseAmount(profile.outstandingBalance) > 0
                            ? c.red
                            : null,
                        last: true),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // ── Billing info ─────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: Text('Billing info',
                        style: AppTextStyles.sectionTitle(color: c.text)),
                  ),
                  GestureDetector(
                    onTap: () => _openBillingEdit(context),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: c.accentSoft,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: c.accentBorder),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.edit_outlined,
                              size: 14, color: c.accent),
                          const SizedBox(width: 5),
                          Text(
                            _hasBilling ? 'Edit' : 'Add',
                            style: AppTextStyles.smallLabelBold(
                                color: c.accent),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _hasBilling
                  ? AppCard(
                      c: c,
                      child: Column(
                        children: [
                          if (profile.legalName != null)
                            KVRow(
                                label: 'Legal name',
                                value: profile.legalName!,
                                c: c),
                          if (profile.gstin != null)
                            KVRow(
                                label: 'GSTIN',
                                value: profile.gstin!,
                                c: c,
                                last: profile.billingAddress1 == null &&
                                    profile.legalName != null),
                          if (profile.billingAddress1 != null)
                            KVRow(
                              label: 'Billing address',
                              value: [
                                profile.billingAddress1,
                                profile.billingAddress2,
                                profile.billingCity,
                                profile.billingState,
                                profile.billingPincode,
                              ].whereType<String>().join(', '),
                              c: c,
                              last: true,
                            ),
                        ],
                      ),
                    )
                  : Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                            color: c.line, style: BorderStyle.solid),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.receipt_long_outlined,
                              size: 20, color: c.textFaint),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'No billing info added yet. Tap Edit to add GST details and billing address.',
                              style:
                                  AppTextStyles.bodyMed(color: c.textMute),
                            ),
                          ),
                        ],
                      ),
                    ),
            ]),
          ),
        ),
      ],
    );
  }
}

class _BillingEditSheet extends StatefulWidget {
  final OutletProfileDto profile;
  final AppThemeColors c;
  final WidgetRef ref;
  const _BillingEditSheet(
      {required this.profile, required this.c, required this.ref});

  @override
  State<_BillingEditSheet> createState() => _BillingEditSheetState();
}

class _BillingEditSheetState extends State<_BillingEditSheet> {
  late final TextEditingController _legalName;
  late final TextEditingController _gstin;
  late final TextEditingController _addr1;
  late final TextEditingController _addr2;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _pincode;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    _legalName = TextEditingController(text: p.legalName ?? '');
    _gstin = TextEditingController(text: p.gstin ?? '');
    _addr1 = TextEditingController(text: p.billingAddress1 ?? '');
    _addr2 = TextEditingController(text: p.billingAddress2 ?? '');
    _city = TextEditingController(text: p.billingCity ?? '');
    _state = TextEditingController(text: p.billingState ?? '');
    _pincode = TextEditingController(text: p.billingPincode ?? '');
  }

  @override
  void dispose() {
    _legalName.dispose();
    _gstin.dispose();
    _addr1.dispose();
    _addr2.dispose();
    _city.dispose();
    _state.dispose();
    _pincode.dispose();
    super.dispose();
  }

  String? _nullIfEmpty(String v) => v.trim().isEmpty ? null : v.trim();

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.ref.read(outletPortalClientProvider).updateBilling(
            legalName: _nullIfEmpty(_legalName.text),
            gstin: _nullIfEmpty(_gstin.text),
            billingAddress1: _nullIfEmpty(_addr1.text),
            billingAddress2: _nullIfEmpty(_addr2.text),
            billingCity: _nullIfEmpty(_city.text),
            billingState: _nullIfEmpty(_state.text),
            billingPincode: _nullIfEmpty(_pincode.text),
          );
      widget.ref.invalidate(_profileProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Failed to save: $e'),
              backgroundColor: widget.c.red),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(
          20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: c.line,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Billing info',
              style: AppTextStyles.headingLg(color: c.text)),
          const SizedBox(height: 4),
          Text('Used on invoices and GST documents.',
              style: AppTextStyles.bodyMed(color: c.textMute)),
          const SizedBox(height: 20),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  _field('Legal name', _legalName, c,
                      hint: 'e.g. City Distributors Pvt Ltd'),
                  const SizedBox(height: 12),
                  _field('GSTIN', _gstin, c,
                      hint: '15-char GST number',
                      caps: TextCapitalization.characters),
                  const SizedBox(height: 12),
                  _field('Address line 1', _addr1, c,
                      hint: 'Building, street'),
                  const SizedBox(height: 12),
                  _field('Address line 2', _addr2, c,
                      hint: 'Area, landmark (optional)'),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                          child: _field('City', _city, c, hint: 'City')),
                      const SizedBox(width: 10),
                      Expanded(
                          child:
                              _field('State', _state, c, hint: 'State')),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _field('Pincode', _pincode, c,
                      hint: '6-digit pincode',
                      keyboard: TextInputType.number),
                  const SizedBox(height: 20),
                  AppButton(
                    label: 'Save billing info',
                    c: c,
                    fullWidth: true,
                    size: AppButtonSize.lg,
                    loading: _saving,
                    onTap: _saving ? null : _save,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(
    String label,
    TextEditingController ctrl,
    AppThemeColors c, {
    String? hint,
    TextInputType keyboard = TextInputType.text,
    TextCapitalization caps = TextCapitalization.words,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: AppTextStyles.smallLabelBold(color: c.textMute)
                .copyWith(letterSpacing: 0.2)),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          keyboardType: keyboard,
          textCapitalization: caps,
          autocorrect: false,
          style: AppTextStyles.bodyBold(color: c.text),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: AppTextStyles.bodyMed(color: c.textFaint),
            filled: true,
            fillColor: c.sunken,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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

class _ErrorState extends StatelessWidget {
  final AppThemeColors c;
  final WidgetRef ref;
  const _ErrorState({required this.c, required this.ref});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: OutletAppBar(title: 'Profile', c: c, showBack: true),
        ),
        SliverFillRemaining(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.error_outline, size: 40, color: c.textFaint),
                  const SizedBox(height: 12),
                  Text('Failed to load profile',
                      style: AppTextStyles.bodyHeavy(color: c.text)),
                  const SizedBox(height: 6),
                  Text('Please check your connection and try again.',
                      style: AppTextStyles.bodyMed(color: c.textMute),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 20),
                  AppButton(
                    label: 'Retry',
                    c: c,
                    icon: Icons.refresh_rounded,
                    onTap: () => ref.invalidate(_profileProvider),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Loading extends StatelessWidget {
  final AppThemeColors c;
  const _Loading({required this.c});

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(18),
        children: List.generate(
          5,
          (_) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(
                height: 52,
                decoration: BoxDecoration(
                    color: c.sunken,
                    borderRadius: BorderRadius.circular(16))),
          ),
        ),
      );
}
