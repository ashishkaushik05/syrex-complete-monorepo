class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.role,
    required this.permissions,
    this.managedWarehouseId,
    this.outletId,
    this.isFieldEnabled = false,
  });

  final String id;
  final String email;
  final String role;
  final List<String> permissions;
  final String? managedWarehouseId;
  final String? outletId;
  final bool isFieldEnabled;
}

class LoginInput {
  const LoginInput({required this.email, required this.password});

  final String email;
  final String password;
}

class LoginResult {
  const LoginResult({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;
}
