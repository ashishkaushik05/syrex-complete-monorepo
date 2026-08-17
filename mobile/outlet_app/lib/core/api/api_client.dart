import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/token_store.dart';

// Base URL injected via --dart-define=BASE_URL=http://10.0.2.2:3000
const _baseUrl = String.fromEnvironment('BASE_URL', defaultValue: 'https://overprecise-nestor-raspingly.ngrok-free.dev/');

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  final Dio _dio;
  final TokenStore _tokens;

  ApiClient(this._dio, this._tokens);

  @visibleForTesting
  Dio get dio => _dio;

  // ── tRPC GET (query) ───────────────────────────────────────
  Future<T> query<T>(
    String procedure,
    Map<String, dynamic> input,
    T Function(dynamic json) fromJson,
  ) async {
    try {
      final res = await _dio.get(
        '/trpc/$procedure',
        queryParameters: {'input': jsonEncode({'json': input})},
      );
      return fromJson(_unwrap(res.data));
    } on DioException catch (e) {
      if (e.response != null) return fromJson(_unwrap(e.response!.data));
      rethrow;
    }
  }

  // ── tRPC POST (mutation) ───────────────────────────────────
  Future<T> mutation<T>(
    String procedure,
    Map<String, dynamic> input,
    T Function(dynamic json) fromJson,
  ) async {
    try {
      final res = await _dio.post(
        '/trpc/$procedure',
        data: jsonEncode({'json': input}),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      return fromJson(_unwrap(res.data));
    } on DioException catch (e) {
      if (e.response != null) return fromJson(_unwrap(e.response!.data));
      rethrow;
    }
  }

  // ── tRPC POST (mutation) with no return value ───────────────
  Future<void> mutationVoid(String procedure, Map<String, dynamic> input) async {
    try {
      await _dio.post(
        '/trpc/$procedure',
        data: jsonEncode({'json': input}),
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
    } on DioException catch (e) {
      if (e.response != null) {
        _unwrap(e.response!.data);
        return;
      }
      rethrow;
    }
  }

  dynamic _unwrap(dynamic data) {
    // tRPC fetch adapter: single object {result:{data:{json:...}}}
    // tRPC batch (batch=1): array [{result:{data:{json:...}}}]
    final Map<String, dynamic> first;
    if (data is List && data.isNotEmpty) {
      first = data[0] as Map<String, dynamic>;
    } else if (data is Map<String, dynamic>) {
      first = data;
    } else {
      throw const ApiException('Unexpected response shape');
    }
    if (first.containsKey('error')) {
      final err = first['error'] as Map<String, dynamic>;
      final msg = (err['json'] as Map<String, dynamic>?)?['message'] as String? ?? 'Unknown error';
      final code = (err['json'] as Map<String, dynamic>?)?['data']?['httpStatus'] as int?;
      throw ApiException(msg, statusCode: code);
    }
    return ((first['result'] as Map<String, dynamic>)['data'] as Map<String, dynamic>)['json'];
  }
}

// ── Dio factory ────────────────────────────────────────────────
Dio buildDio(TokenStore tokens) {
  final dio = Dio(BaseOptions(
    baseUrl: _baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
    sendTimeout: const Duration(seconds: 10),
  ));

  // Auth interceptor: inject bearer + actor/org headers + 401 refresh
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await tokens.accessToken;
        final userId = await tokens.userId;
        final orgId = await tokens.orgId;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        if (userId != null) options.headers['x-actor-id'] = userId;
        if (orgId != null) options.headers['x-org-id'] = orgId;
        handler.next(options);
      },
      onError: (err, handler) async {
        // Avoid infinite retry loop for the refresh request itself.
        if (err.requestOptions.extra['_retry'] == true) {
          handler.next(err);
          return;
        }
        if (err.response?.statusCode == 401) {
          final refresh = await tokens.refreshToken;
          if (refresh != null) {
            try {
              final resp = await dio.post(
                '/trpc/auth.refresh',
                data: jsonEncode({'json': {'refreshToken': refresh}}),
                options: Options(
                  headers: {'Content-Type': 'application/json'},
                  extra: {'_retry': true},
                ),
              );
              final raw = resp.data;
              final first = raw is List ? raw[0] as Map : raw as Map;
              final json = ((first['result'] as Map)['data'] as Map)['json'] as Map<String, dynamic>;
              await tokens.save(
                accessToken: json['accessToken'] as String,
                refreshToken: json['refreshToken'] as String,
                userId: (json['user'] as Map<String, dynamic>)['id'] as String,
                orgId: json['orgId'] as String? ?? '',
                outletId: (json['user'] as Map<String, dynamic>)['outletId'] as String? ?? '',
              );
              // Retry original request
              final opts = err.requestOptions;
              final newToken = await tokens.accessToken;
              opts.headers['Authorization'] = 'Bearer $newToken';
              final retryResp = await dio.fetch(opts);
              return handler.resolve(retryResp);
            } catch (_) {
              await tokens.clear();
            }
          }
        }
        handler.next(err);
      },
    ),
  );

  return dio;
}

// ── Riverpod providers ─────────────────────────────────────────
final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final dioProvider = Provider<Dio>((ref) {
  final tokens = ref.read(tokenStoreProvider);
  return buildDio(tokens);
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.read(dioProvider), ref.read(tokenStoreProvider));
});
