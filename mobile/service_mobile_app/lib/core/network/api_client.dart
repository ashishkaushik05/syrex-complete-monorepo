import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_env.dart';
import '../errors/app_error.dart';
import '../storage/token_store.dart';

final appConfigProvider = Provider<AppConfig>((_) => AppConfig.fromDartDefine());
final sessionExpiredSignalProvider = StateProvider<int>((_) => 0);

class TokenRefreshMutex {
  Completer<void>? _inFlight;

  Future<void> run(Future<void> Function() refresh) {
    final existing = _inFlight;
    if (existing != null) return existing.future;

    final completer = Completer<void>();
    _inFlight = completer;
    () async {
      try {
        await refresh();
        completer.complete();
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      } finally {
        if (identical(_inFlight, completer)) _inFlight = null;
      }
    }();
    return completer.future;
  }
}

dynamic extractTrpcResult(dynamic raw) {
  dynamic value = raw;
  if (value is List && value.isNotEmpty) value = value.first;
  if (value is! Map) {
    throw const AppError(AppErrorType.server, 'Invalid server response.');
  }
  final error = value['error'];
  if (error is Map) {
    throw AppError(
      AppErrorType.server,
      error['message']?.toString() ?? 'Server request failed.',
    );
  }
  return value['result']?['data']?['json'];
}

Dio buildAuthedDio({
  required AppConfig config,
  required TokenStore tokenStore,
  required Future<void> Function() onSessionExpired,
}) {
  final dio = Dio(BaseOptions(
    baseUrl: config.baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 25),
    headers: const {'content-type': 'application/json'},
  ));
  final refreshMutex = TokenRefreshMutex();

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final tokens = await tokenStore.read();
      if (tokens != null) {
        options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
      handler.next(options);
    },
    onError: (error, handler) async {
      final request = error.requestOptions;
      if (error.response?.statusCode != 401 ||
          request.extra['retried'] == true ||
          request.path.contains('auth.refresh')) {
        handler.next(error);
        return;
      }

      try {
        await refreshMutex.run(() async {
            final tokens = await tokenStore.read();
            if (tokens == null) throw StateError('No refresh token');
            final refreshDio = Dio(BaseOptions(
              baseUrl: config.baseUrl,
              connectTimeout: const Duration(seconds: 15),
              sendTimeout: const Duration(seconds: 20),
              receiveTimeout: const Duration(seconds: 20),
            ));
            final response = await refreshDio.post(
              '/auth.refresh',
              data: {
                'json': {'refreshToken': tokens.refreshToken},
              },
            );
            final raw = extractTrpcResult(response.data);
            if (raw is! Map) {
              throw StateError('Token refresh returned an invalid response');
            }
            final json = Map<String, dynamic>.from(raw);
            final accessToken = json['accessToken']?.toString() ?? '';
            final refreshToken = json['refreshToken']?.toString() ?? '';
            if (accessToken.isEmpty || refreshToken.isEmpty) {
              throw StateError('Token refresh failed');
            }
            await tokenStore.write(TokenPair(
              accessToken: accessToken,
              refreshToken: refreshToken,
            ));
        });

        request.extra['retried'] = true;
        final tokens = await tokenStore.read();
        request.headers['Authorization'] = 'Bearer ${tokens!.accessToken}';
        handler.resolve(await dio.fetch(request));
      } catch (_) {
        await tokenStore.clear();
        await onSessionExpired();
        handler.next(error);
      }
    },
  ));
  return dio;
}

final dioProvider = Provider<Dio>((ref) {
  return buildAuthedDio(
    config: ref.watch(appConfigProvider),
    tokenStore: ref.watch(tokenStoreProvider),
    onSessionExpired: () async {
      ref.read(sessionExpiredSignalProvider.notifier).state++;
    },
  );
});

class TrpcClient {
  TrpcClient(this.dio);

  final Dio dio;

  Future<dynamic> query(String procedure, [Map<String, dynamic>? input]) async {
    final query = input == null
        ? ''
        : '?input=${Uri.encodeComponent(jsonEncode({'json': input}))}';
    final response = await dio.get('/$procedure$query');
    return extractTrpcResult(response.data);
  }

  Future<dynamic> mutate(String procedure, [Map<String, dynamic>? input]) async {
    final response = await dio.post(
      '/$procedure',
      data: {'json': input ?? <String, dynamic>{}},
    );
    return extractTrpcResult(response.data);
  }
}

final trpcClientProvider = Provider<TrpcClient>((ref) {
  return TrpcClient(ref.watch(dioProvider));
});
