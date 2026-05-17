import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_env.dart';
import '../storage/token_store.dart';

final appConfigProvider = Provider<AppConfig>((_) => AppConfig.fromDartDefine());

final dioProvider = Provider<Dio>((ref) {
  final config = ref.watch(appConfigProvider);
  final tokenStore = ref.watch(tokenStoreProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: const {'content-type': 'application/json'},
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final tokens = await tokenStore.read();
        if (tokens != null) {
          options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
        }
        handler.next(options);
      },
    ),
  );

  return dio;
});

Future<dynamic> trpcQuery(
  Ref ref,
  String procedure,
  Map<String, dynamic>? input,
) async {
  final dio = ref.read(dioProvider);
  final query = input == null ? '' : '?input=${Uri.encodeComponent(jsonEncode({'json': input}))}';
  final response = await dio.get('/$procedure$query');
  return response.data?['result']?['data']?['json'];
}

Future<dynamic> trpcMutation(
  Ref ref,
  String procedure,
  Map<String, dynamic>? input,
) async {
  final dio = ref.read(dioProvider);
  final response = await dio.post('/$procedure', data: {'json': input ?? {}});
  return response.data?['result']?['data']?['json'];
}
