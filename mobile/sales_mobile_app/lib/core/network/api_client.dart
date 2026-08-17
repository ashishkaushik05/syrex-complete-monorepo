import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/token_store.dart';
import '../config/app_env.dart';
import 'authed_dio.dart';

final appConfigProvider =
    Provider<AppConfig>((ref) => AppConfig.fromDartDefine());

final dioProvider = Provider<Dio>((ref) {
  return buildAuthedDio(
    config: ref.watch(appConfigProvider),
    tokenStore: ref.watch(tokenStoreProvider),
  );
});
