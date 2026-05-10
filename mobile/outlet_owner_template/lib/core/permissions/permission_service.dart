import '../auth/auth_models.dart';

class PermissionService {
  const PermissionService();

  bool can(AuthUser user, String permission) {
    return user.permissions.contains('*') ||
        user.permissions.contains(permission);
  }
}
