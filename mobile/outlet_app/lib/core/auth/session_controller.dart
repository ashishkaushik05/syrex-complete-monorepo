import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../auth/token_store.dart';
import '../models/session.dart';

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => SessionState.restoring;

  TokenStore get _tokens => ref.read(tokenStoreProvider);
  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> restoreSession() async {
    final hasSession = await _tokens.hasSession;
    if (!hasSession) {
      state = SessionState.empty;
      return;
    }

    try {
      final me = await _api.query(
          'auth.me', {}, (j) => SessionUser.fromJson(j as Map<String, dynamic>));
      final orgId = await _tokens.orgId;
      final access = await _tokens.accessToken;
      final refresh = await _tokens.refreshToken;
      // Keep the cached user up-to-date for future offline restores.
      await _tokens.saveUser(me);
      state = SessionState(
        accessToken: access,
        refreshToken: refresh,
        orgId: orgId,
        user: me,
      );
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        // Token is genuinely invalid — clear and send to login.
        await _tokens.clear();
        state = SessionState.empty;
      } else {
        // Server error (5xx, etc.) — try offline restore.
        await _restoreOffline();
      }
    } on DioException catch (_) {
      // Network error — do NOT clear tokens; restore from cache instead.
      await _restoreOffline();
    } catch (_) {
      await _restoreOffline();
    }
  }

  // Restore session from the locally-cached user without network.
  Future<void> _restoreOffline() async {
    final cachedUser = await _tokens.cachedUser;
    if (cachedUser != null) {
      final orgId = await _tokens.orgId;
      final access = await _tokens.accessToken;
      final refresh = await _tokens.refreshToken;
      state = SessionState(
        accessToken: access,
        refreshToken: refresh,
        orgId: orgId,
        user: cachedUser,
        isOffline: true,
      );
    } else {
      // No cached user (network error before first successful session restore).
      // Keep the tokens — they may still be valid once network returns.
      // Send the user to login so they can retry.
      state = SessionState.empty;
    }
  }

  Future<void> login(String email, String password) async {
    final result = await _api.mutation('auth.login', {
      'email': email,
      'password': password,
    }, (j) => j as Map<String, dynamic>);

    final user = SessionUser.fromJson(result['user'] as Map<String, dynamic>);
    final access = result['accessToken'] as String;
    final refresh = result['refreshToken'] as String;
    final orgId = result['orgId'] as String? ?? '';

    await _tokens.save(
      accessToken: access,
      refreshToken: refresh,
      userId: user.id,
      orgId: orgId,
      outletId: user.outletId ?? '',
    );
    // Cache immediately so the next offline restore has user data.
    await _tokens.saveUser(user);

    state = SessionState(
      accessToken: access,
      refreshToken: refresh,
      orgId: orgId,
      user: user,
    );
  }

  Future<void> logout() async {
    try {
      await _api.mutationVoid('auth.logout', {});
    } catch (_) {}
    await _tokens.clear();
    state = SessionState.empty;
  }
}

final sessionControllerProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);
