import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session_controller.dart';

/// Provides the outletId for the currently authenticated outlet user.
/// Returns null if the session has no linked outlet (non-outlet user).
final outletIdProvider = Provider<String?>((ref) {
  final session = ref.watch(sessionControllerProvider);
  return session.user?.outletId;
});
