import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../storage/token_store.dart';
import '../config/app_env.dart';

final appConfigProvider =
    Provider<AppConfig>((ref) => AppConfig.fromDartDefine());

final dioProvider = Provider<Dio>((ref) {
  final config = ref.watch(appConfigProvider);
  final tokenStore = ref.watch(tokenStoreProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      // Prevents ngrok's browser-warning interstitial from intercepting responses.
      headers: const {'ngrok-skip-browser-warning': '1'},
    ),
  );

  var refreshInFlight = false;
  Completer<void>? refreshCompleter;

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final tokens = await tokenStore.read();
        if (tokens != null) {
          options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
        }
        // Inject org context
        try {
          final userJson = await const FlutterSecureStorage().read(key: 'cached_user_json');
          if (userJson != null) {
            final user = jsonDecode(userJson) as Map<String, dynamic>;
            final orgId = user['orgId'] as String?;
            if (orgId != null) {
              options.headers['x-org-id'] = orgId;
            }
          }
        } catch (_) {}
        handler.next(options);
      },
      onError: (error, handler) async {
        final response = error.response;
        final requestOptions = error.requestOptions;

        final isUnauthorized = response?.statusCode == 401;
        final alreadyRetried = requestOptions.extra['retried'] == true;
        final isRefreshCall = requestOptions.path.contains('auth.refresh');

        if (!isUnauthorized || alreadyRetried || isRefreshCall) {
          handler.next(error);
          return;
        }

        try {
          if (!refreshInFlight) {
            refreshInFlight = true;
            refreshCompleter = Completer<void>();
            final current = await tokenStore.read();
            if (current == null) {
              throw Exception('No refresh token');
            }

            final refreshDio = Dio(BaseOptions(baseUrl: config.baseUrl));
            final refreshResponse = await refreshDio.post(
              '/trpc/auth.refresh',
              data: jsonEncode({
                'json': {'refreshToken': current.refreshToken},
              }),
              options: Options(headers: {'Content-Type': 'application/json'}),
            );

            final refreshData = refreshResponse.data;
            String? accessToken;
            String? refreshToken;
            if (refreshData is List && refreshData.isNotEmpty) {
              final first = refreshData.first;
              if (first is Map<String, dynamic>) {
                final json = (first['result']?['data']?['json']
                    as Map<String, dynamic>?);
                accessToken = json?['accessToken']?.toString();
                refreshToken = json?['refreshToken']?.toString();
              }
            }
            if (accessToken == null || accessToken.isEmpty) {
              throw Exception('Refresh failed');
            }
            await tokenStore.write(
              TokenPair(
                accessToken: accessToken,
                refreshToken: refreshToken ?? current.refreshToken,
              ),
            );
            refreshCompleter?.complete();
          } else {
            await refreshCompleter?.future;
          }

          requestOptions.extra['retried'] = true;
          final retryResponse = await dio.fetch(requestOptions);
          handler.resolve(retryResponse);
        } catch (_) {
          await tokenStore.clear();
          handler.next(error);
        } finally {
          refreshInFlight = false;
        }
      },
    ),
  );

  return dio;
});
