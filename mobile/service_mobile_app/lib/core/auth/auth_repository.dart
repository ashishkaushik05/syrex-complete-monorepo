import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../errors/app_error.dart';
import '../network/api_client.dart';
import '../storage/token_store.dart';
import 'auth_models.dart';

class AuthRepository {
  AuthRepository(this.client, this.tokenStore);

  final TrpcClient client;
  final TokenStore tokenStore;

  Future<AuthUser> login(String email, String password) async {
    final raw = await client.mutate('auth.login', {
      'email': email.trim(),
      'password': password,
    });
    final result = _requireMap(raw, 'login');
    final accessToken = result['accessToken']?.toString() ?? '';
    final refreshToken = result['refreshToken']?.toString() ?? '';
    if (accessToken.isEmpty || refreshToken.isEmpty) {
      throw const AppError(AppErrorType.server, 'Login response was incomplete.');
    }
    final user = AuthUser.fromJson(_requireMap(result['user'], 'login user'));
    if (!user.isAsi && !user.isServiceEngineer) {
      throw const AppError(
        AppErrorType.forbidden,
        'Only ASI and Service Engineer accounts can use this app.',
      );
    }
    await tokenStore.write(TokenPair(
      accessToken: accessToken,
      refreshToken: refreshToken,
    ));
    return user;
  }

  Future<AuthUser> me() async {
    final result = _requireMap(await client.query('auth.me'), 'session');
    final user = AuthUser.fromJson(result);
    if (!user.isAsi && !user.isServiceEngineer) {
      throw const AppError(
        AppErrorType.forbidden,
        'This account is not enabled for the service mobile app.',
      );
    }
    return user;
  }

  Future<void> logout() async {
    try {
      await client.mutate('auth.logout');
    } finally {
      await tokenStore.clear();
    }
  }

  Map<String, dynamic> _requireMap(dynamic value, String context) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    throw AppError(
      AppErrorType.server,
      'Invalid $context response from the server.',
    );
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.watch(trpcClientProvider),
    ref.watch(tokenStoreProvider),
  );
});
