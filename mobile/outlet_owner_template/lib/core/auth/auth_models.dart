class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.role,
    required this.permissions,
    this.managedWarehouseId,
    this.outletId,
    this.orgId,
    this.isFieldEnabled = false,
  });

  final String id;
  final String email;
  final String role;
  final List<String> permissions;
  final String? managedWarehouseId;
  final String? outletId;
  final String? orgId;
  final bool isFieldEnabled;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      role: json['role'] as String? ?? 'Unknown',
      permissions: ((json['permissions'] ?? <dynamic>[]) as List<dynamic>)
          .map((e) => e.toString())
          .toList(),
      managedWarehouseId: json['managedWarehouseId'] as String?,
      outletId: json['outletId'] as String?,
      orgId: json['orgId'] as String?,
      isFieldEnabled: json['isFieldEnabled'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'role': role,
      'permissions': permissions,
      'managedWarehouseId': managedWarehouseId,
      'outletId': outletId,
      'orgId': orgId,
      'isFieldEnabled': isFieldEnabled,
    };
  }

  AuthUser copyWith({
    String? id,
    String? email,
    String? role,
    List<String>? permissions,
    String? managedWarehouseId,
    String? outletId,
    String? orgId,
    bool? isFieldEnabled,
  }) {
    return AuthUser(
      id: id ?? this.id,
      email: email ?? this.email,
      role: role ?? this.role,
      permissions: permissions ?? this.permissions,
      managedWarehouseId: managedWarehouseId ?? this.managedWarehouseId,
      outletId: outletId ?? this.outletId,
      orgId: orgId ?? this.orgId,
      isFieldEnabled: isFieldEnabled ?? this.isFieldEnabled,
    );
  }
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
