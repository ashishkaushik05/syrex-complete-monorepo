import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../shared/widgets/premium_surfaces.dart';
import '../models/field_models.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

class ReportStopPage extends ConsumerStatefulWidget {
  const ReportStopPage({super.key});

  @override
  ConsumerState<ReportStopPage> createState() => _ReportStopPageState();
}

class _ReportStopPageState extends ConsumerState<ReportStopPage> {
  static const _reasons = ['Break', 'Client wait', 'Travel delay', 'Other'];

  String _reason = _reasons.first;
  final _notesCtrl = TextEditingController();
  bool _pending = false;
  String? _banner;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<Position> _locate() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.deniedForever) {
      setState(() => _banner = 'Location permission permanently denied. Please enable it in app settings.');
      throw Exception('Location permission permanently denied');
    }
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      throw Exception('Location permission denied');
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }

  Future<void> _startStop() async {
    final shift = await ref.read(activeShiftProvider.future);
    if (shift == null) {
      setState(() => _banner = 'No active shift. Start a shift before reporting a stop.');
      return;
    }
    setState(() {
      _pending = true;
      _banner = null;
    });
    try {
      final pos = await _locate();
      await ref.read(fieldRepositoryProvider).startStop(
            lat: pos.latitude,
            lng: pos.longitude,
            reason: _reason,
            notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
          );
      ref.invalidate(activeStopProvider);
      setState(() => _banner = 'Stop started.');
    } catch (_) {
      setState(() => _banner = 'Could not start stop. Confirm shift, GPS and network.');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  Future<void> _endStop(FieldStopModel active) async {
    setState(() {
      _pending = true;
      _banner = null;
    });
    try {
      await ref.read(fieldRepositoryProvider).endStop(
            stopId: active.id,
            notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
          );
      ref.invalidate(activeStopProvider);
      setState(() => _banner = 'Stop ended successfully.');
    } catch (_) {
      setState(() => _banner = 'Could not end stop. Retry in a moment.');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeStopAsync = ref.watch(activeStopProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Report Location Stop')),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            if (_banner != null)
              InlineBanner(
                message: _banner!,
                type: _banner!.contains('success') || _banner!.contains('started')
                    ? BannerType.success
                    : BannerType.error,
              ),
            PremiumCard(
              child: activeStopAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Unable to resolve stop lifecycle.'),
                data: (active) {
                  if (active == null) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('No active stop', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        const SizedBox(height: 8),
                        const Text('Start a stop with a reason and optional notes.'),
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _reasons
                              .map(
                                (reason) => ChoiceChip(
                                  label: Text(reason),
                                  selected: _reason == reason,
                                  onSelected: (_) => setState(() => _reason = reason),
                                ),
                              )
                              .toList(),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _notesCtrl,
                          minLines: 2,
                          maxLines: 4,
                          decoration: const InputDecoration(
                            labelText: 'Notes',
                            hintText: 'Add context for this stop',
                          ),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _pending ? null : _startStop,
                            child: _pending
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Text('Start Stop'),
                          ),
                        ),
                      ],
                    );
                  }

                  final elapsed = DateTime.now().difference(DateTime.parse(active.startedAt).toLocal());
                  final h = elapsed.inHours;
                  final m = elapsed.inMinutes % 60;

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Active stop running', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          StateBadge(label: 'ACTIVE', color: AppPalette.rose),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('Reason: ${active.reason ?? 'Not set'}'),
                      Text('Elapsed: ${h}h ${m}m'),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _notesCtrl,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'End Notes',
                          hintText: 'Add final note (optional)',
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.tonal(
                          onPressed: _pending ? null : () => _endStop(active),
                          child: _pending
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('End Stop'),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
