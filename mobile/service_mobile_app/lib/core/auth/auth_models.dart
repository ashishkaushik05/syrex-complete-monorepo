class AuthUser {
  const AuthUser({
    required this.id,
    required this.name,
    required this.email,
    required this.roleName,
    required this.permissions,
  });

  final String id;
  final String name;
  final String email;
  final String roleName;
  final List<String> permissions;

  bool get isAsi => roleName.trim().toLowerCase() == 'asi';
  bool get isServiceEngineer =>
      roleName.trim().toLowerCase() == 'service engineer';

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final role = json['role'] as Map<String, dynamic>? ?? const {};
    final id = json['id']?.toString().trim() ?? '';
    final name = json['name']?.toString().trim() ?? '';
    final email = json['email']?.toString().trim() ?? '';
    final roleName = role['name']?.toString().trim() ?? '';
    if (id.isEmpty || name.isEmpty || email.isEmpty || roleName.isEmpty) {
      throw const FormatException('Invalid staff session response');
    }
    return AuthUser(
      id: id,
      name: name,
      email: email,
      roleName: roleName,
      permissions: (role['permissions'] as List? ?? const [])
          .map((value) => value.toString())
          .toList(),
    );
  }
}
