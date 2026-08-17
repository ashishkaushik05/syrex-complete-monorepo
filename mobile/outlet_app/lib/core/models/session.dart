class SessionUser {
  final String id;
  final String email;
  final String name;
  final String userType;
  final String? outletId;
  final List<String> permissions;

  const SessionUser({
    required this.id,
    required this.email,
    required this.name,
    required this.userType,
    this.outletId,
    required this.permissions,
  });

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
    id: j['id'] as String,
    email: j['email'] as String,
    name: j['name'] as String,
    userType: j['userType'] as String,
    outletId: j['outletId'] as String?,
    permissions: ((j['role'] as Map<String, dynamic>?)?['permissions'] as List<dynamic>? ?? []).cast<String>(),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'name': name,
    'userType': userType,
    if (outletId != null) 'outletId': outletId,
    'role': {'permissions': permissions},
  };
}

class SessionState {
  final String? accessToken;
  final String? refreshToken;
  final String? orgId;
  final SessionUser? user;
  // True while the initial session restore is running (shows splash screen).
  final bool isRestoring;
  // True when session was restored from cache without network verification.
  final bool isOffline;

  const SessionState({
    this.accessToken,
    this.refreshToken,
    this.orgId,
    this.user,
    this.isRestoring = false,
    this.isOffline = false,
  });

  bool get isAuthenticated => accessToken != null && user != null;
  String get outletId => user?.outletId ?? '';

  SessionState copyWith({
    String? accessToken,
    String? refreshToken,
    String? orgId,
    SessionUser? user,
    bool? isRestoring,
    bool? isOffline,
  }) => SessionState(
    accessToken: accessToken ?? this.accessToken,
    refreshToken: refreshToken ?? this.refreshToken,
    orgId: orgId ?? this.orgId,
    user: user ?? this.user,
    isRestoring: isRestoring ?? this.isRestoring,
    isOffline: isOffline ?? this.isOffline,
  );

  // App just launched — show splash.
  static const restoring = SessionState(isRestoring: true);

  // Not authenticated, no restore in progress.
  static const empty = SessionState();
}
