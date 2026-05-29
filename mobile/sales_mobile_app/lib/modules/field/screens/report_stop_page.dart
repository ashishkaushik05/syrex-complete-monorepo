import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/rb_components.dart';
import '../models/field_models.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

const _stopPresets = ['Lunch', 'Tea break', 'Personal', 'Meeting', 'Travel'];

class ReportStopPage extends ConsumerStatefulWidget {
  const ReportStopPage({super.key});

  @override
  ConsumerState<ReportStopPage> createState() => _ReportStopPageState();
}

class _ReportStopPageState extends ConsumerState<ReportStopPage> {
  String _preset = _stopPresets.first;
  bool _pending = false;
  Timer? _ticker;
  int _tickSeconds = 0;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _tickSeconds++);
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _startStop() async {
    setState(() => _pending = true);
    try {
      await ref.read(fieldRepositoryProvider).startStop(
            lat: 0,
            lng: 0,
            reason: _preset,
          );
      ref.invalidate(activeStopProvider);
    } catch (e) {
      if (mounted) RbToast.show(context, 'Error: $e');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<void> _endStop() async {
    setState(() => _pending = true);
    try {
      final stop = await ref.read(fieldRepositoryProvider).activeStop();
      if (stop == null) {
        setState(() => _pending = false);
        return;
      }
      await ref.read(fieldRepositoryProvider).endStop(stopId: stop.id);
      ref.invalidate(activeStopProvider);
    } catch (e) {
      if (mounted) RbToast.show(context, 'Error: $e');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final stopAsync = ref.watch(activeStopProvider);
    final c = rbColors(context);

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        children: [
          RbTopBar(
            title: 'Stops',
            leading: IconButton(
              icon: Icon(Icons.arrow_back, size: 20, color: c.ink),
              onPressed: () => context.pop(),
            ),
            sub: 'Only one open stop at a time',
          ),
          Expanded(
            child: stopAsync.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: RbColors.accent)),
              error: (_, __) => RbEmpty(
                  icon: Icons.error_outline, title: 'Could not load stop status'),
              data: (stop) => _StopBody(
                activeStop: stop?.isActive == true ? stop : null,
                preset: _preset,
                pending: _pending,
                onPresetSelected: (p) => setState(() => _preset = p),
                onStart: _startStop,
                onEnd: _endStop,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StopBody extends StatelessWidget {
  const _StopBody({
    required this.activeStop,
    required this.preset,
    required this.pending,
    required this.onPresetSelected,
    required this.onStart,
    required this.onEnd,
  });
  final FieldStopModel? activeStop;
  final String preset;
  final bool pending;
  final ValueChanged<String> onPresetSelected;
  final VoidCallback onStart;
  final VoidCallback onEnd;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (activeStop != null) ...[
            // Active stop hero
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: RbColors.warnSoft,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: RbColors.warn.withOpacity(0.4), width: 0.5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.coffee_outlined,
                          size: 20, color: RbColors.warn),
                      const SizedBox(width: 10),
                      Text(activeStop!.reason ?? 'Break',
                          style: GoogleFonts.inter(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: RbColors.warn)),
                      const Spacer(),
                      RbChip(label: 'Active', tone: RbTone.warn),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(_duration(activeStop!.startedAt),
                      style: GoogleFonts.inter(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          color: RbColors.warn,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  const SizedBox(height: 12),
                  RbBtn(
                    label: 'End stop',
                    variant: RbBtnVariant.outline,
                    size: RbBtnSize.lg,
                    loading: pending,
                    onPressed: pending ? null : onEnd,
                  ),
                ],
              ),
            ),
          ] else ...[
            // Preset chips
            Text('Select reason',
                style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: c.muted)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _stopPresets
                  .map((p) => GestureDetector(
                        onTap: () => onPresetSelected(p),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: preset == p ? c.ink : c.surface,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: preset == p ? c.ink : c.line,
                                width: 0.5),
                          ),
                          child: Text(
                            p,
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: preset == p ? Colors.white : c.ink2,
                            ),
                          ),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 24),
            RbBtn(
              label: 'Start $preset',
              variant: RbBtnVariant.accent,
              size: RbBtnSize.lg,
              loading: pending,
              onPressed: pending ? null : onStart,
            ),
          ],
        ],
      ),
    );
  }

  static String _duration(String iso) {
    final start = DateTime.tryParse(iso)?.toLocal();
    if (start == null) return '—';
    final diff = DateTime.now().difference(start);
    final m = diff.inMinutes;
    return m < 60 ? '${m}m' : '${diff.inHours}h ${m % 60}m';
  }
}
