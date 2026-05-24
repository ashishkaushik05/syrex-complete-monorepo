import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/api/sales_client.dart';
import '../../../shared/widgets/premium_surfaces.dart';
import '../providers/field_providers.dart';
import '../repository/field_repository.dart';

final _outletsProvider = FutureProvider.autoDispose<List<SalesOutlet>>((ref) async {
  return ref.read(salesClientProvider).outlets();
});

class CreateVisitPage extends ConsumerStatefulWidget {
  const CreateVisitPage({super.key});

  @override
  ConsumerState<CreateVisitPage> createState() => _CreateVisitPageState();
}

class _CreateVisitPageState extends ConsumerState<CreateVisitPage> {
  final _notesCtrl = TextEditingController();
  final _audioCtrl = TextEditingController();
  Position? _position;
  bool _loadingLocation = false;
  bool _submitting = false;
  String? _outletId;
  String? _customerId;
  String? _banner;

  @override
  void initState() {
    super.initState();
    _captureLocation();
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    _audioCtrl.dispose();
    super.dispose();
  }

  Future<void> _captureLocation() async {
    final shift = await ref.read(activeShiftProvider.future);
    if (shift == null) {
      setState(() => _banner = 'No active shift. Start a shift before logging a visit.');
      return;
    }
    setState(() => _loadingLocation = true);
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        setState(() => _banner = 'Location permission permanently denied. Please enable it in app settings.');
        return;
      }
      if (permission == LocationPermission.denied) {
        setState(() => _banner = 'Location permission is required for visit logging.');
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      setState(() => _position = position);
    } catch (_) {
      setState(() => _banner = 'Unable to capture GPS lock. Retry to continue.');
    } finally {
      if (mounted) setState(() => _loadingLocation = false);
    }
  }

  bool _canSubmit(bool hasActiveShift) {
    return hasActiveShift &&
        _position != null &&
        _notesCtrl.text.trim().length >= 8 &&
        !_submitting;
  }

  Future<void> _submit() async {
    final shift = await ref.read(activeShiftProvider.future);
    if (shift == null) {
      setState(() => _banner = 'No active shift. Start shift before logging visit.');
      return;
    }
    if (_position == null) {
      setState(() => _banner = 'GPS lock required before submitting visit.');
      return;
    }
    setState(() {
      _submitting = true;
      _banner = null;
    });
    try {
      await ref.read(fieldRepositoryProvider).logVisit(
            lat: _position!.latitude,
            lng: _position!.longitude,
            outletId: _outletId,
            customerId: _customerId,
            notes: _notesCtrl.text.trim(),
            audioUrl: _audioCtrl.text.trim().isEmpty ? null : _audioCtrl.text.trim(),
            recordedAt: _position!.timestamp,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Visit logged successfully.')),
      );
    } catch (e) {
      final msg = e.toString();
      setState(() {
        if (msg.contains('No active shift')) {
          _banner = 'No active shift. Start shift and retry.';
        } else if (msg.contains('SocketException')) {
          _banner = 'No network. Retry when online.';
        } else if (msg.contains('permission')) {
          _banner = 'Permission denied. Enable location access and retry.';
        } else {
          _banner = 'Visit submission failed. Please retry.';
        }
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final shiftAsync = ref.watch(activeShiftProvider);
    final outletsAsync = ref.watch(_outletsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Create Visit')),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            shiftAsync.when(
              loading: () => const PremiumCard(child: LinearProgressIndicator()),
              error: (_, __) => const PremiumCard(child: Text('Unable to check shift status.')),
              data: (shift) => PremiumCard(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Shift State', style: TextStyle(fontWeight: FontWeight.w700)),
                        Text(shift == null ? 'Inactive' : 'Active', style: const TextStyle(color: Color(0xFF617182))),
                      ],
                    ),
                    StateBadge(
                      label: shift == null ? 'SHIFT OFF' : 'SHIFT ON',
                      color: shift == null ? AppPalette.amber : AppPalette.mint,
                    ),
                  ],
                ),
              ),
            ),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Location Evidence', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 8),
                  if (_position == null)
                    Text(
                      _loadingLocation ? 'Acquiring GPS lock...' : 'No location fix yet.',
                      style: const TextStyle(color: Color(0xFF617182)),
                    )
                  else
                    Text(
                      'Lat: ${_position!.latitude.toStringAsFixed(6)}\nLng: ${_position!.longitude.toStringAsFixed(6)}\nAccuracy: ±${_position!.accuracy.toStringAsFixed(0)}m\nTimestamp: ${_position!.timestamp.toLocal()}',
                      style: const TextStyle(color: Color(0xFF4D5B68), height: 1.3),
                    ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      onPressed: _loadingLocation ? null : _captureLocation,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Refresh GPS'),
                    ),
                  ),
                ],
              ),
            ),
            if (_banner != null)
              InlineBanner(
                message: _banner!,
                type: _banner!.contains('failed') || _banner!.contains('required')
                    ? BannerType.error
                    : BannerType.warning,
              ),
            PremiumCard(
              child: outletsAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Unable to load outlets'),
                data: (outlets) {
                  final selectedOutlet = outlets.where((e) => e.id == _outletId).firstOrNull;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DropdownButtonFormField<String>(
                        value: _outletId,
                        decoration: const InputDecoration(labelText: 'Outlet (optional)'),
                        isExpanded: true,
                        items: outlets
                            .map((outlet) => DropdownMenuItem(
                                  value: outlet.id,
                                  child: Text('${outlet.name} (${outlet.outletCode})'),
                                ))
                            .toList(),
                        onChanged: (v) {
                          setState(() {
                            _outletId = v;
                            _customerId = null;
                          });
                        },
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String?>(
                        value: _customerId,
                        decoration: const InputDecoration(labelText: 'Customer (optional)'),
                        items: [
                          const DropdownMenuItem<String?>(value: null, child: Text('No customer link')),
                          if (selectedOutlet != null)
                            DropdownMenuItem<String?>(
                              value: selectedOutlet.userId,
                              child: Text(selectedOutlet.ownerName),
                            ),
                        ],
                        onChanged: (v) => setState(() => _customerId = v),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _notesCtrl,
                        minLines: 3,
                        maxLines: 5,
                        decoration: const InputDecoration(
                          labelText: 'Visit Notes *',
                          hintText: 'Minimum 8 characters',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _audioCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Audio / Media URL (optional)',
                          hintText: 'Paste uploaded file link',
                        ),
                      ),
                      const SizedBox(height: 16),
                      shiftAsync.maybeWhen(
                        data: (shift) => SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _canSubmit(shift != null) ? _submit : null,
                            child: _submitting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Text('Submit Visit'),
                          ),
                        ),
                        orElse: () => const SizedBox.shrink(),
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
