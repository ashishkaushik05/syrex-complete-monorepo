import 'dart:convert';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/session.dart';

class TokenStore {
  final FlutterSecureStorage _storage;

  TokenStore()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
        );

  @visibleForTesting
  TokenStore.withStorage(FlutterSecureStorage storage) : _storage = storage;

  static const _kAccess = 'outlet_access_token';
  static const _kRefresh = 'outlet_refresh_token';
  static const _kUserId = 'outlet_user_id';
  static const _kOrgId = 'outlet_org_id';
  static const _kOutletId = 'outlet_outlet_id';
  static const _kCachedUser = 'outlet_cached_user';

  Future<String?> get accessToken => _storage.read(key: _kAccess);
  Future<String?> get refreshToken => _storage.read(key: _kRefresh);
  Future<String?> get userId => _storage.read(key: _kUserId);
  Future<String?> get orgId => _storage.read(key: _kOrgId);
  Future<String?> get outletId => _storage.read(key: _kOutletId);

  Future<SessionUser?> get cachedUser async {
    final raw = await _storage.read(key: _kCachedUser);
    if (raw == null) return null;
    try {
      return SessionUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> save({
    required String accessToken,
    required String refreshToken,
    required String userId,
    required String orgId,
    required String outletId,
  }) async {
    await Future.wait([
      _storage.write(key: _kAccess, value: accessToken),
      _storage.write(key: _kRefresh, value: refreshToken),
      _storage.write(key: _kUserId, value: userId),
      _storage.write(key: _kOrgId, value: orgId),
      _storage.write(key: _kOutletId, value: outletId),
    ]);
  }

  Future<void> saveUser(SessionUser user) =>
      _storage.write(key: _kCachedUser, value: jsonEncode(user.toJson()));

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _kAccess),
      _storage.delete(key: _kRefresh),
      _storage.delete(key: _kUserId),
      _storage.delete(key: _kOrgId),
      _storage.delete(key: _kOutletId),
      _storage.delete(key: _kCachedUser),
    ]);
  }

  Future<bool> get hasSession async {
    final t = await accessToken;
    return t != null && t.isNotEmpty;
  }
}
