import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/sales_client.dart';
import '../../../shared/widgets/rb_components.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

final _visitOutletsProvider = FutureProvider.autoDispose<List<SalesOutlet>>((ref) {
  return ref.read(salesClientProvider).outlets();
});

class CreateVisitPage extends ConsumerStatefulWidget {
  const CreateVisitPage({super.key});

  @override
  ConsumerState<CreateVisitPage> createState() => _CreateVisitPageState();
}

class _CreateVisitPageState extends ConsumerState<CreateVisitPage> {
  final _noteCtrl = TextEditingController();
  Position? _position;
  bool _loadingGps = false;
  bool _submitting = false;
  bool _success = false;
  String? _outletId;

  @override
  void initState() {
    super.initState();
    _fetchGps();
  }

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchGps() async {
    setState(() => _loadingGps = true);
    try {
      final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      if (mounted) setState(() => _position = pos);
    } catch (_) {}
    if (mounted) setState(() => _loadingGps = false);
  }

  Future<void> _submit() async {
    final pos = _position;
    if (pos == null) return;
    final shift = await ref.read(fieldRepositoryProvider).activeShift();
    if (shift == null) {
      if (mounted) RbToast.show(context, 'No active shift');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(fieldRepositoryProvider).logVisit(
            lat: pos.latitude,
            lng: pos.longitude,
            notes: _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
            outletId: _outletId,
          );
      ref.invalidate(visitsForShiftProvider(shift.id));
      if (mounted) {
        setState(() => _success = true);
        await Future.delayed(const Duration(milliseconds: 1200));
        if (mounted) context.pop();
      }
    } catch (e) {
      if (mounted) RbToast.show(context, 'Error: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final outletsAsync = ref.watch(_visitOutletsProvider);
    final shiftAsync = ref.watch(activeShiftProvider);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          RbTopBar(
            title: 'Log visit',
            leading: IconButton(
              icon: Icon(Icons.arrow_back, size: 20, color: c.ink),
              onPressed: () => context.pop(),
            ),
            sub: 'Captures current GPS',
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // GPS card
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          Icon(Icons.navigation_outlined,
                              size: 20, color: RbColors.accent),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _loadingGps
                                ? Text('Getting location…',
                                    style: GoogleFonts.inter(
                                        fontSize: 13, color: c.muted))
                                : _position == null
                                    ? Text('Location unavailable',
                                        style: GoogleFonts.inter(
                                            fontSize: 13, color: RbColors.danger))
                                    : Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            '${_position!.latitude.toStringAsFixed(6)}, ${_position!.longitude.toStringAsFixed(6)}',
                                            style: GoogleFonts.jetBrainsMono(
                                                fontSize: 12, color: c.ink),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '±${_position!.accuracy.toStringAsFixed(0)}m accuracy',
                                            style: GoogleFonts.inter(
                                                fontSize: 11, color: c.muted),
                                          ),
                                        ],
                                      ),
                          ),
                          if (_loadingGps)
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: RbColors.accent),
                            )
                          else
                            GestureDetector(
                              onTap: _fetchGps,
                              child: Icon(Icons.refresh, size: 18, color: c.muted),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Outlet selector
                  outletsAsync.maybeWhen(
                    data: (outlets) => RbCard(
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
                            child: Row(
                              children: [
                                Text('Outlet (optional)',
                                    style: GoogleFonts.inter(
                                        fontSize: 12, color: c.muted)),
                              ],
                            ),
                          ),
                          for (int i = 0; i < outlets.length; i++)
                            RbRow(
                              isFirst: i == 0,
                              onTap: () => setState(() => _outletId =
                                  _outletId == outlets[i].id
                                      ? null
                                      : outlets[i].id),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(outlets[i].name,
                                        style: GoogleFonts.inter(
                                            fontSize: 14, color: c.ink)),
                                  ),
                                  if (_outletId == outlets[i].id)
                                    const Icon(Icons.check,
                                        size: 16, color: RbColors.accent),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                    orElse: () => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 12),

                  // Note
                  RbCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: TextField(
                        controller: _noteCtrl,
                        maxLines: 4,
                        style: GoogleFonts.inter(fontSize: 14, color: c.ink),
                        decoration: InputDecoration(
                          hintText: 'Add a note (optional)',
                          hintStyle: GoogleFonts.inter(color: c.muted2),
                          border: InputBorder.none,
                          filled: false,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  RbBtn(
                    label: _success
                        ? 'Visit logged ✓'
                        : 'Log visit at this location',
                    variant: _success ? RbBtnVariant.outline : RbBtnVariant.accent,
                    size: RbBtnSize.lg,
                    loading: _submitting,
                    onPressed: (_submitting || _position == null || _success)
                        ? null
                        : _submit,
                  ),

                  // Today's visits
                  shiftAsync.maybeWhen(
                    data: (shift) => shift != null
                        ? _TodayVisitsList(shiftId: shift.id)
                        : const SizedBox.shrink(),
                    orElse: () => const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TodayVisitsList extends ConsumerWidget {
  const _TodayVisitsList({required this.shiftId});
  final String shiftId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(visitsForShiftProvider(shiftId));
    final c = rbColors(context);

    return async.maybeWhen(
      data: (visits) {
        if (visits.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 20),
            RbSection(label: "Today's visits (${visits.length})"),
            const SizedBox(height: 8),
            RbCard(
              child: Column(
                children: [
                  for (int i = 0; i < visits.length; i++)
                    RbRow(
                      isFirst: i == 0,
                      child: Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                                color: RbColors.accent,
                                shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              visits[i].description ?? 'Visit logged',
                              style: GoogleFonts.inter(
                                  fontSize: 14, color: c.ink),
                            ),
                          ),
                          Text(_fmtTime(visits[i].recordedAt),
                              style: GoogleFonts.inter(
                                  fontSize: 12, color: c.muted)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  static String _fmtTime(String iso) {
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return '—';
    final h = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m ${dt.hour >= 12 ? 'PM' : 'AM'}';
  }
}
