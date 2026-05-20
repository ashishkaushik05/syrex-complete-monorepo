import 'dart:io';

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

// ── FieldPermissionHealth ─────────────────────────────────────────────────────

class FieldPermissionHealth {
  const FieldPermissionHealth({
    required this.location,
    required this.backgroundLocation,
    required this.batteryOptimizationDisabled,
  });

  final bool location;
  final bool backgroundLocation;
  final bool batteryOptimizationDisabled;

  bool get canStartTracking => location;
  bool get isFullyOptimized =>
      location && backgroundLocation && batteryOptimizationDisabled;

  static const FieldPermissionHealth unavailable = FieldPermissionHealth(
    location: false,
    backgroundLocation: false,
    batteryOptimizationDisabled: false,
  );
}

// ── FieldPermissionCoordinator ────────────────────────────────────────────────
// Owns all location/battery permission UX. Permissions are requested at
// shift-start context, not at app bootstrap.

class FieldPermissionCoordinator {
  const FieldPermissionCoordinator._();
  static const FieldPermissionCoordinator instance =
      FieldPermissionCoordinator._();

  /// Check current permission state without prompting.
  Future<FieldPermissionHealth> check() async {
    if (!Platform.isAndroid && !Platform.isIOS) {
      return const FieldPermissionHealth(
        location: true,
        backgroundLocation: true,
        batteryOptimizationDisabled: true,
      );
    }
    final loc = await Permission.location.status;
    final bg = await Permission.locationAlways.status;
    final bat = Platform.isAndroid
        ? (await Permission.ignoreBatteryOptimizations.status).isGranted
        : true;
    return FieldPermissionHealth(
      location: loc.isGranted,
      backgroundLocation: bg.isGranted,
      batteryOptimizationDisabled: bat,
    );
  }

  /// Request all permissions needed to start a shift. Shows contextual
  /// dialogs explaining WHY each permission is needed.
  Future<FieldPermissionHealth> requestForShiftStart(
      BuildContext context) async {
    if (!Platform.isAndroid && !Platform.isIOS) {
      return const FieldPermissionHealth(
        location: true,
        backgroundLocation: true,
        batteryOptimizationDisabled: true,
      );
    }

    // Step 1: foreground location.
    var locStatus = await Permission.location.status;
    if (locStatus.isDenied) {
      if (context.mounted) {
        await _showExplanation(
          context: context,
          title: 'Location Required',
          body:
              'Field Sense needs your location to track your shift and build your daily trail.',
        );
      }
      locStatus = await Permission.location.request();
    }
    if (!locStatus.isGranted) {
      if (locStatus.isPermanentlyDenied && context.mounted) {
        await _showSettingsPrompt(context,
            'Location permission is required. Please enable it in Settings.');
      }
      return FieldPermissionHealth(
        location: false,
        backgroundLocation: false,
        batteryOptimizationDisabled: await _checkBattery(),
      );
    }

    // Step 2: background location (Android 10+ needs separate request).
    bool bgGranted = false;
    if (Platform.isAndroid) {
      var bgStatus = await Permission.locationAlways.status;
      if (!bgStatus.isGranted) {
        if (context.mounted) {
          await _showExplanation(
            context: context,
            title: 'Background Location',
            body:
                'To capture your trail even when the app is in the background, please select "Allow all the time" on the next screen.',
          );
        }
        bgStatus = await Permission.locationAlways.request();
        bgGranted = bgStatus.isGranted;
        if (!bgGranted && bgStatus.isPermanentlyDenied && context.mounted) {
          await _showSettingsPrompt(
              context, 'Enable "Allow all the time" in Settings for reliable tracking.');
        }
      } else {
        bgGranted = true;
      }
    } else {
      bgGranted = (await Permission.locationAlways.status).isGranted;
    }

    // Step 3: battery optimization exemption (Android only).
    final bat = await _checkBattery();

    return FieldPermissionHealth(
      location: true,
      backgroundLocation: bgGranted,
      batteryOptimizationDisabled: bat,
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  Future<bool> _checkBattery() async {
    if (!Platform.isAndroid) return true;
    final status = await Permission.ignoreBatteryOptimizations.status;
    if (status.isGranted) return true;
    final result = await Permission.ignoreBatteryOptimizations.request();
    return result.isGranted;
  }

  Future<void> _showExplanation({
    required BuildContext context,
    required String title,
    required String body,
  }) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }

  Future<void> _showSettingsPrompt(BuildContext context, String message) async {
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Permission Required'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Later'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              openAppSettings();
            },
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
  }
}
