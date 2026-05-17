import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_models.dart';
import '../auth/session_controller.dart';

class PermissionService {
  const PermissionService();

  bool can(AuthUser user, String permission) {
    return user.permissions.contains('*') ||
        user.permissions.contains(permission);
  }
}

final permissionServiceProvider = Provider<PermissionService>((ref) {
  return const PermissionService();
});

final isSalesAuthorizedProvider = Provider<bool>((ref) {
  final session = ref.watch(sessionControllerProvider);
  final user = session.user;
  if (user == null) return false;
  final service = ref.watch(permissionServiceProvider);
  return service.can(user, "orders:read") &&
      service.can(user, "orders:write") &&
      service.can(user, "outlets:read");
});

final canUseFieldProvider = Provider<bool>((ref) {
  final session = ref.watch(sessionControllerProvider);
  final user = session.user;
  if (user == null) return false;
  final service = ref.watch(permissionServiceProvider);
  return service.can(user, "field:read") || service.can(user, "field:write");
});

final canAdminFieldProvider = Provider<bool>((ref) {
  final session = ref.watch(sessionControllerProvider);
  final user = session.user;
  if (user == null) return false;
  final service = ref.watch(permissionServiceProvider);
  return service.can(user, "field:admin");
});
