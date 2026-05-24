import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../repository/field_repository.dart';

class LogVisitScreen extends ConsumerStatefulWidget {
  const LogVisitScreen({super.key});

  @override
  ConsumerState<LogVisitScreen> createState() => _LogVisitScreenState();
}

class _LogVisitScreenState extends ConsumerState<LogVisitScreen> {
  final _descController = TextEditingController();
  Position? _position;
  bool _locating = false;
  bool _submitting = false;
  String? _locationError;

  @override
  void initState() {
    super.initState();
    _captureLocation();
  }

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  Future<void> _captureLocation() async {
    setState(() {
      _locating = true;
      _locationError = null;
    });

    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() {
          _locationError = 'Location permission denied. '
              'Please enable it in Settings.';
          _locating = false;
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      setState(() {
        _position = pos;
        _locating = false;
      });
    } catch (e) {
      setState(() {
        _locationError = 'Could not get location. Please try again.';
        _locating = false;
      });
    }
  }

  Future<void> _submit() async {
    if (_position == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Waiting for GPS fix…')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(fieldRepositoryProvider).logVisit(
            lat: _position!.latitude,
            lng: _position!.longitude,
            description: _descController.text.trim().isEmpty
                ? null
                : _descController.text.trim(),
            recordedAt: _position!.timestamp ?? DateTime.now(),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Visit logged')),
        );
        context.pop();
      }
    } catch (e) {
      final msg = e.toString();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg.contains('No active shift')
                ? 'No active shift. Please start a shift first.'
                : 'Failed to log visit. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Log Visit')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // GPS status card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        _position != null
                            ? Icons.gps_fixed
                            : Icons.gps_not_fixed,
                        color: _position != null ? Colors.green : Colors.orange,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text('GPS Location',
                          style: Theme.of(context).textTheme.titleSmall),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_locating)
                    const Row(
                      children: [
                        SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2)),
                        SizedBox(width: 8),
                        Text('Getting location…'),
                      ],
                    )
                  else if (_locationError != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_locationError!,
                            style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: _captureLocation,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Retry'),
                        ),
                      ],
                    )
                  else if (_position != null)
                    Text(
                      '${_position!.latitude.toStringAsFixed(6)}, '
                      '${_position!.longitude.toStringAsFixed(6)}\n'
                      'Accuracy: ±${_position!.accuracy.toStringAsFixed(0)} m',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            fontFamily: 'monospace',
                          ),
                    ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Notes field
          TextField(
            controller: _descController,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Notes (optional)',
              hintText: 'Describe the visit, outlet name, outcome…',
              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 24),

          FilledButton.icon(
            onPressed:
                (_submitting || _locating || _position == null)
                    ? null
                    : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.check),
            label: Text(_submitting ? 'Logging…' : 'Log Visit'),
          ),
        ],
      ),
    );
  }
}
