import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_models.dart';
import 'auth_repository.dart';
import '../location/background_location_service.dart';
import '../location/field_sync_store.dart';
import '../storage/token_store.dart';
import '../../modules/field/providers/field_providers.dart';

enum SessionStatus {
  unknown,
  authenticated,
  unauthenticated,
  refreshing,
  expired
}

class SessionState {
  const SessionState({required this.status, this.user, this.errorMessage});

  final SessionStatus status;
  final AuthUser? user;
  final String? errorMessage;

  SessionState copyWith(
      {SessionStatus? status, AuthUser? user, String? errorMessage}) {
    return SessionState(
      status: status ?? this.status,
      user: user ?? this.user,
      errorMessage: errorMessage,
    );
  }
}

class SessionController extends Notifier<SessionState> {
  static const _bootstrapTimeout = Duration(seconds: 8);

  @override
  SessionState build() {
    _bootstrap();
    return const SessionState(status: SessionStatus.unknown);
  }

  Future<void> _bootstrap() async {
    final tokenStore = ref.read(tokenStoreProvider);
    final authRepository = ref.read(authRepositoryProvider);

    final tokens = await tokenStore.read().timeout(
          const Duration(seconds: 3),
          onTimeout: () => null,
        );
    if (tokens == null) {
      state = const SessionState(status: SessionStatus.unauthenticated);
      return;
    }

    try {
      final user = await authRepository.me().timeout(_bootstrapTimeout);
      state = SessionState(status: SessionStatus.authenticated, user: user);
    } catch (e, st) {
      debugPrint('[_bootstrap] me() failed: $e\n$st');
      try {
        state = const SessionState(status: SessionStatus.refreshing);
        await authRepository.refreshTokens().timeout(_bootstrapTimeout);
        final user = await authRepository.me().timeout(_bootstrapTimeout);
        state = SessionState(status: SessionStatus.authenticated, user: user);
      } catch (e, st) {
        debugPrint('[_bootstrap] refresh/me() failed: $e\n$st');
        await authRepository.forceLogoutLocal();
        state = const SessionState(status: SessionStatus.expired);
        unawaited(BackgroundLocationService.stop().timeout(
          const Duration(seconds: 2),
          onTimeout: () {},
        ));
      }
    }
  }

  Future<void> login({required String email, required String password}) async {
    final authRepository = ref.read(authRepositoryProvider);
    try {
      final result = await authRepository
          .login(LoginInput(email: email, password: password));
      state =
          SessionState(status: SessionStatus.authenticated, user: result.user);
    } catch (e, st) {
      debugPrint('[login] error: $e\n$st');
      state = const SessionState(
        status: SessionStatus.unauthenticated,
        errorMessage: 'Login failed. Check credentials and backend.',
      );
    }
  }

  Future<void> refreshSession() async {
    final authRepository = ref.read(authRepositoryProvider);
    try {
      final user = await authRepository.me();
      state = state.copyWith(user: user);
    } catch (e, st) {
      debugPrint('[refreshSession] error: $e\n$st');
      state = state.copyWith(
        errorMessage: 'Session refresh failed: ${e.toString()}',
      );
    }
  }

  Future<void> logout() async {
    final authRepository = ref.read(authRepositoryProvider);
    unawaited(BackgroundLocationService.stop().timeout(
      const Duration(seconds: 2),
      onTimeout: () {},
    ));
    await ref.read(fieldSyncStoreProvider).clearActiveShift();
    ref.invalidate(activeShiftProvider);
    ref.invalidate(activeStopProvider);
    await authRepository.logout();
    state = const SessionState(status: SessionStatus.unauthenticated);
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);
