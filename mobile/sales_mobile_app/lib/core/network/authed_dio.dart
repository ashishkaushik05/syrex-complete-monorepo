import 'dart:async';
import 'package:dio/dio.dart';

import '../config/app_env.dart';
import '../storage/token_store.dart';

/// Builds a [Dio] configured for the tRPC backend with automatic Bearer-token
/// injection and a 401 → refresh → retry interceptor.
///
/// This is the single source of truth for the authenticated HTTP client. Both
/// the Riverpod `dioProvider` (main isolate) and the background location
/// service isolate construct their client through this function so that token
/// handling stays identical across isolates.
Dio buildAuthedDio({
  required AppConfig config,
  required TokenStore tokenStore,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      // Prevents ngrok's browser-warning interstitial from intercepting responses.
      headers: {
        'ngrok-skip-browser-warning': '1',
        if (config.orgId != null && config.orgId!.isNotEmpty)
          'x-org-id': config.orgId,
      },
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
        handler.next(options);
      },
      onError: (error, handler) async {
        final response = error.response;
        final requestOptions = error.requestOptions;
        // The exact Authorization header this request was sent with. Used to
        // detect a peer-isolate token rotation after a failed refresh.
        final usedAuthHeader =
            requestOptions.headers['Authorization']?.toString();

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

          // Peer-isolate rotation recovery. The app runs two independent
          // uploaders — the main isolate and the background-location isolate —
          // each with its own Dio + refresh guard (this closure is per-Dio).
          // The backend rotates (single-use) refresh tokens, so when both
          // isolates hit a 401 at the same time and both POST /auth.refresh,
          // the slower one presents an already-revoked token and fails here —
          // even though the session is perfectly alive. Clearing tokens in that
          // case would also wipe the fresh tokens the winning isolate just
          // wrote, hard-logging-out the agent mid-shift. So before tearing the
          // session down, check whether storage now holds a *different* access
          // token; if so, the peer refreshed and we simply retry with it.
          if (await _peerRotated(tokenStore, usedAuthHeader)) {
            try {
              requestOptions.extra['retried'] = true;
              final retryResponse = await dio.fetch(requestOptions);
              handler.resolve(retryResponse);
              return;
            } catch (_) {
              // The peer's token didn't work either — fall through to teardown.
            }
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
}

/// Detects whether another isolate rotated the auth tokens while our own
/// refresh was in flight. The winning isolate's [TokenStore.write] may not have
/// landed at the exact moment our refresh POST was rejected, so we poll the
/// stored access token briefly for it to differ from the one the failed request
/// was sent with ([usedAuthHeader] is the literal `Bearer <token>` value).
Future<bool> _peerRotated(TokenStore tokenStore, String? usedAuthHeader) async {
  for (var i = 0; i < 6; i++) {
    final tokens = await tokenStore.read();
    if (tokens != null &&
        tokens.accessToken.isNotEmpty &&
        'Bearer ${tokens.accessToken}' != usedAuthHeader) {
      return true;
    }
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }
  return false;
}
