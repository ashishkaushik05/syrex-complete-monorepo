import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../storage/token_store.dart';
import 'auth_models.dart';

class AuthRepository {
  AuthRepository({required this.dio, required this.tokenStore});

  final Dio dio;
  final TokenStore tokenStore;

  Future<LoginResult> login(LoginInput input) async {
    final response = await dio.post(
      '/auth.login',
      data: '{"json":{"email":"${input.email}","password":"${input.password}"}}',
      options: Options(headers: {'Content-Type': 'application/json'}),
    );

    final result = _extractResult(response.data);
    final accessToken = (result['accessToken'] ?? '') as String;
    final refreshToken = (result['refreshToken'] ?? '') as String;

    final user = AuthUser(
      id: (result['user']?['id'] ?? '') as String,
      email: (result['user']?['email'] ?? input.email) as String,
      role: (result['user']?['role']?['name'] ?? 'Unknown') as String,
      permissions: ((result['user']?['role']?['permissions'] ?? <dynamic>[])
              as List<dynamic>)
          .map((e) => e.toString())
          .toList(),
      managedWarehouseId: result['user']?['managedWarehouseId']?.toString(),
      outletId: result['user']?['outletId']?.toString(),
    );

    await tokenStore
        .write(TokenPair(accessToken: accessToken, refreshToken: refreshToken));

    return LoginResult(
        accessToken: accessToken, refreshToken: refreshToken, user: user);
  }

  Future<AuthUser> me() async {
    final response = await dio.get('/auth.me');
    final result = _extractResult(response.data);

    return AuthUser(
      id: (result['id'] ?? '') as String,
      email: (result['email'] ?? '') as String,
      role: (result['role']?['name'] ?? 'Unknown') as String,
      permissions:
          ((result['role']?['permissions'] ?? <dynamic>[]) as List<dynamic>)
              .map((e) => e.toString())
              .toList(),
      managedWarehouseId: result['managedWarehouseId']?.toString(),
      outletId: result['outletId']?.toString(),
      isFieldEnabled: (result['isFieldEnabled'] as bool?) ?? false,
    );
  }

  Future<void> refreshTokens() async {
    final current = await tokenStore.read();
    if (current == null) {
      throw Exception('No refresh token');
    }

    final response = await dio.post(
      '/auth.refresh',
      data: '{"json":{"refreshToken":"${current.refreshToken}"}}',
      options: Options(headers: {
        'Content-Type': 'application/json',
        'Authorization': null,
      }),
    );

    final result = _extractResult(response.data);
    final accessToken = (result['accessToken'] ?? '') as String;
    final refreshToken =
        (result['refreshToken'] ?? current.refreshToken) as String;

    await tokenStore
        .write(TokenPair(accessToken: accessToken, refreshToken: refreshToken));
  }

  Future<void> logout() async {
    try {
      await dio.get('/auth.logout');
    } finally {
      await tokenStore.clear();
    }
  }

  Future<void> forceLogoutLocal() async {
    await tokenStore.clear();
  }

  Map<String, dynamic> _extractResult(dynamic raw) {
    if (raw is List && raw.isNotEmpty) {
      final first = raw.first;
      if (first is Map<String, dynamic>) {
        return (first['result']?['data']?['json'] ?? <String, dynamic>{})
            as Map<String, dynamic>;
      }
    }

    if (raw is Map<String, dynamic>) {
      return (raw['result']?['data']?['json'] ?? <String, dynamic>{})
          as Map<String, dynamic>;
    }

    return <String, dynamic>{};
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    dio: ref.watch(dioProvider),
    tokenStore: ref.watch(tokenStoreProvider),
  );
});
