import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Emits true = online, false = offline.
// Yields the current status immediately, then updates on changes.
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final conn = Connectivity();
  final initial = await conn.checkConnectivity();
  yield _isOnline(initial);
  yield* conn.onConnectivityChanged.map(_isOnline);
});

bool _isOnline(List<ConnectivityResult> results) =>
    results.any((r) => r != ConnectivityResult.none);
