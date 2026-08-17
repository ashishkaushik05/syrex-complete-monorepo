import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'field_permission_service.dart';

class FieldPermissionState {
  const FieldPermissionState({
    this.status,
    this.isChecking = false,
  });
  final FieldPermissionStatus? status;
  final bool isChecking;
  bool get allGranted => status?.allGranted ?? false;
}

class FieldPermissionCoordinator extends StateNotifier<FieldPermissionState> {
  FieldPermissionCoordinator() : super(const FieldPermissionState());

  /// Check current permission state without requesting.
  Future<void> check() async {
    state = const FieldPermissionState(isChecking: true);
    final status = await FieldPermissionService.checkOnly();
    if (!mounted) return;
    state = FieldPermissionState(status: status, isChecking: false);
  }

  /// Request all required permissions. Returns true if all granted.
  Future<bool> requestForShiftStart() async {
    state = const FieldPermissionState(isChecking: true);
    final status = await FieldPermissionService.requestAll();
    if (!mounted) return false;
    state = FieldPermissionState(status: status, isChecking: false);
    return status.allGranted;
  }
}

final fieldPermissionCoordinatorProvider =
    StateNotifierProvider<FieldPermissionCoordinator, FieldPermissionState>(
  (_) => FieldPermissionCoordinator(),
);
