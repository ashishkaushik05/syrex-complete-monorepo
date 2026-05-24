import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
        if (config.orgId != null && config.orgId!.isNotEmpty) {
          options.headers['x-org-id'] = config.orgId;
        }
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
            // Set flag and create completer atomically before any await so
            // concurrent 401s don't both enter the refresh block.
            refreshInFlight = true;
            refreshCompleter = Completer<void>();
            final current = await tokenStore.read();
            if (current == null) {
              throw Exception('No refresh token');
            }

            final refreshDio = Dio(BaseOptions(baseUrl: config.baseUrl));
            final refreshResponse = await refreshDio.post(
              '/auth.refresh',
              data: {
                'json': {'refreshToken': current.refreshToken},
              },
              options: Options(headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '1',
              }),
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
            refreshCompleter!.complete();
          } else {
            // Another caller is already refreshing — wait for it to finish,
            // then fall through to retry with the new token.
            await refreshCompleter!.future;
          }

          requestOptions.extra['retried'] = true;
          final retryResponse = await dio.fetch(requestOptions);
          handler.resolve(retryResponse);
        } catch (e) {
          // Complete the completer with an error so waiting callers unblock.
          if (refreshCompleter != null && !refreshCompleter!.isCompleted) {
            refreshCompleter!.completeError(e);
          }
          await tokenStore.clear();
          handler.next(error);
        } finally {
          refreshInFlight = false;
          refreshCompleter = null;
        }
      },
    ),
  );

  return dio;
});
