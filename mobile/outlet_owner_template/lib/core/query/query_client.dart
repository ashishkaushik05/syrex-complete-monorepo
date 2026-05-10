import 'package:flutter_riverpod/flutter_riverpod.dart';

class QueryPolicy {
  const QueryPolicy(
      {required this.listStaleSeconds, required this.detailStaleSeconds});

  final int listStaleSeconds;
  final int detailStaleSeconds;
}

final queryPolicyProvider = Provider<QueryPolicy>((ref) {
  return const QueryPolicy(listStaleSeconds: 60, detailStaleSeconds: 30);
});
