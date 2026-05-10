import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_models.dart';
import 'auth_repository.dart';
import '../storage/token_store.dart';

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
  @override
  SessionState build() {
    _bootstrap();
    return const SessionState(status: SessionStatus.unknown);
  }

  Future<void> _bootstrap() async {
    final tokenStore = ref.read(tokenStoreProvider);
    final authRepository = ref.read(authRepositoryProvider);

    final tokens = await tokenStore.read();
    if (tokens == null) {
      state = const SessionState(status: SessionStatus.unauthenticated);
      return;
    }

    try {
      final user = await authRepository.me();
      state = SessionState(status: SessionStatus.authenticated, user: user);
    } catch (_) {
      try {
        state = const SessionState(status: SessionStatus.refreshing);
        await authRepository.refreshTokens();
        final user = await authRepository.me();
        state = SessionState(status: SessionStatus.authenticated, user: user);
      } catch (_) {
        await authRepository.forceLogoutLocal();
        state = const SessionState(status: SessionStatus.expired);
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
    } catch (_) {
      state = const SessionState(
        status: SessionStatus.unauthenticated,
        errorMessage: 'Login failed. Check credentials and backend.',
      );
    }
  }

  Future<void> logout() async {
    final authRepository = ref.read(authRepositoryProvider);
    await authRepository.logout();
    state = const SessionState(status: SessionStatus.unauthenticated);
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);
