import 'dart:io';

import 'package:permission_handler/permission_handler.dart';

class FieldPermissionService {
  /// Requests all permissions required for Field Sense to function correctly.
  ///
  /// Call once during app startup (before runApp or from the splash screen).
  /// The method is intentionally lenient — a denial does not throw; the caller
  /// can check the returned [FieldPermissionStatus] and surface guidance.
  static Future<FieldPermissionStatus> requestAll() async {
    if (!Platform.isAndroid && !Platform.isIOS) {
      return const FieldPermissionStatus(
        location: true,
        backgroundLocation: true,
        batteryOptimizationDisabled: true,
      );
    }

    // Step 1: notification permission (Android 13+, required for foreground service).
    if (Platform.isAndroid) {
      await Permission.notification.request();
    }

    // Step 2: fine location (foreground).
    final locationStatus = await Permission.location.request();
    if (!locationStatus.isGranted) {
      return FieldPermissionStatus(
        location: false,
        backgroundLocation: false,
        batteryOptimizationDisabled: await _batteryOptStatus(),
      );
    }

    // Step 2: background location — must be requested after foreground is granted.
    bool bgGranted = false;
    if (Platform.isAndroid) {
      final bgStatus = await Permission.locationAlways.request();
      bgGranted = bgStatus.isGranted;
    } else {
      bgGranted = (await Permission.locationAlways.status).isGranted;
    }

    // Step 3: battery optimisation exemption (Android only).
    final batteryDisabled = await _batteryOptStatus();

    return FieldPermissionStatus(
      location: true,
      backgroundLocation: bgGranted,
      batteryOptimizationDisabled: batteryDisabled,
    );
  }

  static Future<bool> _batteryOptStatus() async {
    if (!Platform.isAndroid) return true;
    final status = await Permission.ignoreBatteryOptimizations.status;
    if (status.isGranted) return true;
    final result = await Permission.ignoreBatteryOptimizations.request();
    return result.isGranted;
  }
}

class FieldPermissionStatus {
  final bool location;
  final bool backgroundLocation;
  final bool batteryOptimizationDisabled;

  const FieldPermissionStatus({
    required this.location,
    required this.backgroundLocation,
    required this.batteryOptimizationDisabled,
  });

  bool get allGranted => location && backgroundLocation && batteryOptimizationDisabled;
}
