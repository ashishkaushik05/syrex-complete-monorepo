import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../errors/app_error.dart';
import '../network/api_client.dart';
import '../storage/token_store.dart';
import 'auth_models.dart';
import 'auth_repository.dart';

enum SessionStatus { unknown, authenticated, unauthenticated, expired, error }

class SessionState {
  const SessionState({
    required this.status,
    this.user,
    this.isSubmitting = false,
    this.error,
  });

  final SessionStatus status;
  final AuthUser? user;
  final bool isSubmitting;
  final AppError? error;
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    ref.listen<int>(sessionExpiredSignalProvider, (_, __) {
      state = const SessionState(status: SessionStatus.expired);
    });
    _bootstrap();
    return const SessionState(status: SessionStatus.unknown);
  }

  Future<void> _bootstrap() async {
    final tokens = await ref.read(tokenStoreProvider).read();
    if (tokens == null) {
      state = const SessionState(status: SessionStatus.unauthenticated);
      return;
    }
    try {
      final user = await ref.read(authRepositoryProvider).me();
      state = SessionState(status: SessionStatus.authenticated, user: user);
    } catch (error) {
      final appError = AppError.from(error);
      if (appError.type == AppErrorType.unauthorized) {
        await ref.read(tokenStoreProvider).clear();
        state = const SessionState(status: SessionStatus.expired);
        return;
      }
      state = SessionState(status: SessionStatus.error, error: appError);
    }
  }

  Future<bool> login(String email, String password) async {
    state = const SessionState(
      status: SessionStatus.unauthenticated,
      isSubmitting: true,
    );
    try {
      final user =
          await ref.read(authRepositoryProvider).login(email, password);
      state = SessionState(status: SessionStatus.authenticated, user: user);
      return true;
    } catch (error) {
      state = SessionState(
        status: SessionStatus.unauthenticated,
        error: AppError.from(error),
      );
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).logout();
    } finally {
      state = const SessionState(status: SessionStatus.unauthenticated);
    }
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
