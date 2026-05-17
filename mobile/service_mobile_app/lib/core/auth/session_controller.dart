import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../storage/token_store.dart';

enum SessionStatus { unknown, authenticated, unauthenticated }

class SessionState {
  const SessionState({required this.status, this.userName});

  final SessionStatus status;
  final String? userName;
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
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
      final profile = await trpcQuery(ref, 'auth.me', null);
      state = SessionState(
        status: SessionStatus.authenticated,
        userName: profile?['user']?['name']?.toString(),
      );
    } catch (_) {
      state = const SessionState(status: SessionStatus.unauthenticated);
    }
  }

  Future<void> logout() async {
    await ref.read(tokenStoreProvider).clear();
    state = const SessionState(status: SessionStatus.unauthenticated);
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
