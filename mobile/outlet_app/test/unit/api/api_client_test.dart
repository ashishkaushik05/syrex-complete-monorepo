// ignore_for_file: lines_longer_than_80_chars

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:outlet_app/core/api/api_client.dart'
    show ApiClient, ApiException, buildDio;
import 'package:outlet_app/core/auth/token_store.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockTokenStore extends Mock implements TokenStore {}

class MockHttpClientAdapter extends Mock implements HttpClientAdapter {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a fake [ResponseBody] for Dio's adapter layer.
ResponseBody _responseBody(
  Object data, {
  int statusCode = 200,
  Map<String, List<String>>? headers,
}) {
  final bytes = utf8.encode(jsonEncode(data));
  return ResponseBody.fromBytes(
    bytes,
    statusCode,
    headers: headers ??
        {
          Headers.contentTypeHeader: ['application/json'],
        },
  );
}

/// Shorthand to build a tRPC success envelope as a list (batch=1).
List<Map<String, dynamic>> _trpcSuccess(dynamic payload) => [
      {
        'result': {
          'data': {'json': payload}
        }
      }
    ];

/// Shorthand to build a tRPC error envelope as a list.
List<Map<String, dynamic>> _trpcError(
  String message, {
  int? httpStatus,
}) =>
    [
      {
        'error': {
          'json': {
            'message': message,
            if (httpStatus != null)
              'data': {'httpStatus': httpStatus},
          }
        }
      }
    ];

/// Build an [ApiClient] with the given [MockHttpClientAdapter] and
/// [MockTokenStore]. All token reads default to null unless overridden.
ApiClient _buildClient(
  MockHttpClientAdapter adapter,
  MockTokenStore tokens,
) {
  // Stub token getters to return null by default.
  when(() => tokens.accessToken).thenAnswer((_) async => null);
  when(() => tokens.userId).thenAnswer((_) async => null);
  when(() => tokens.orgId).thenAnswer((_) async => null);
  when(() => tokens.refreshToken).thenAnswer((_) async => null);

  final dio = buildDio(tokens);
  dio.options.baseUrl = 'http://localhost:3000';
  dio.httpClientAdapter = adapter;

  return ApiClient(dio, tokens);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });

  late MockTokenStore tokens;
  late MockHttpClientAdapter adapter;
  late ApiClient client;

  setUp(() {
    tokens = MockTokenStore();
    adapter = MockHttpClientAdapter();
    client = _buildClient(adapter, tokens);
  });

  // -------------------------------------------------------------------------
  group('ApiException', () {
    test('toString with statusCode', () {
      const ex = ApiException('Not found', statusCode: 404);
      expect(ex.toString(), 'ApiException(404): Not found');
    });

    test('toString with null statusCode', () {
      const ex = ApiException('Oops');
      expect(ex.toString(), 'ApiException(null): Oops');
    });

    test('holds message and statusCode', () {
      const ex = ApiException('Bad request', statusCode: 400);
      expect(ex.message, 'Bad request');
      expect(ex.statusCode, 400);
    });
  });

  // -------------------------------------------------------------------------
  group('tRPC query construction', () {
    test('GET /trpc/<procedure> with input={"json":{}} for empty input',
        () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({'ok': true}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;

      expect(opts.method, 'GET');
      expect(opts.path, contains('/trpc/auth.me'));

      final inputParam = opts.queryParameters['input'] as String;
      final decoded = jsonDecode(inputParam) as Map<String, dynamic>;
      expect(decoded['json'], <String, dynamic>{});
    });

    test('query encodes non-empty input under "json" key', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({'ok': true}));
      });

      await client.query(
          'outletPortal.summary', {'outletId': 'abc'}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;

      final inputParam = opts.queryParameters['input'] as String;
      final decoded = jsonDecode(inputParam) as Map<String, dynamic>;
      expect(decoded['json'], {'outletId': 'abc'});
    });

    test('query injects Authorization header when token is non-null', () async {
      when(() => tokens.accessToken).thenAnswer((_) async => 'tok_123');

      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers['Authorization'], 'Bearer tok_123');
    });

    test('query injects x-actor-id when userId is non-null', () async {
      when(() => tokens.userId).thenAnswer((_) async => 'user_abc');

      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers['x-actor-id'], 'user_abc');
    });

    test('query injects x-org-id when orgId is non-null', () async {
      when(() => tokens.orgId).thenAnswer((_) async => 'org_xyz');

      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers['x-org-id'], 'org_xyz');
    });

    test('Authorization header is omitted when accessToken is null', () async {
      // accessToken already null from setUp default.
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers.containsKey('Authorization'), isFalse);
    });

    test('x-actor-id header is omitted when userId is null', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers.containsKey('x-actor-id'), isFalse);
    });

    test('x-org-id header is omitted when orgId is null', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.query('auth.me', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers.containsKey('x-org-id'), isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('tRPC mutation construction', () {
    test('POST /trpc/<procedure> for mutation', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({'id': '99'}));
      });

      await client.mutation('orders.create', {'lines': []}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;

      expect(opts.method, 'POST');
      expect(opts.path, contains('/trpc/orders.create'));
    });

    test('mutation body wraps input under "json" key', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({'id': '99'}));
      });

      await client.mutation('orders.create', {'lines': []}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;

      final body = jsonDecode(opts.data as String) as Map<String, dynamic>;
      expect(body['json'], {'lines': []});
    });

    test('mutation sets Content-Type: application/json', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({}));
      });

      await client.mutation('orders.create', {}, (j) => j);

      final captured =
          verify(() => adapter.fetch(captureAny(), any(), any())).captured;
      final opts = captured.first as RequestOptions;
      expect(opts.headers['Content-Type'], 'application/json');
    });
  });

  // -------------------------------------------------------------------------
  group('Response unwrapping (_unwrap)', () {
    test('list envelope: extracts result.data.json', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(_trpcSuccess({'id': '1'}));
      });

      final result = await client.query('auth.me', {}, (j) => j);
      expect(result, {'id': '1'});
    });

    test('map envelope (non-batch): extracts result.data.json', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody({
          'result': {
            'data': {'json': 'hello'}
          }
        });
      });

      final result = await client.query('auth.me', {}, (j) => j);
      expect(result, 'hello');
    });

    test('error envelope throws ApiException with message and statusCode',
        () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(
          _trpcError('Not found', httpStatus: 404),
          statusCode: 404,
        );
      });

      expect(
        () => client.query('auth.me', {}, (j) => j),
        throwsA(
          isA<ApiException>()
              .having((e) => e.message, 'message', 'Not found')
              .having((e) => e.statusCode, 'statusCode', 404),
        ),
      );
    });

    test('error envelope missing httpStatus yields null statusCode', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(
          [
            {
              'error': {
                'json': {'message': 'Something went wrong'}
              }
            }
          ],
          statusCode: 500,
        );
      });

      expect(
        () => client.query('auth.me', {}, (j) => j),
        throwsA(
          isA<ApiException>()
              .having((e) => e.message, 'message', 'Something went wrong')
              .having((e) => e.statusCode, 'statusCode', isNull),
        ),
      );
    });

    test('empty list throws ApiException with "Unexpected response shape"',
        () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody([], statusCode: 200);
      });

      expect(
        () => client.query('auth.me', {}, (j) => j),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Unexpected response shape',
          ),
        ),
      );
    });

    test('null response throws ApiException with "Unexpected response shape"',
        () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        // Return the literal string "null" — Dio will parse it as null.
        final bytes = utf8.encode('null');
        return ResponseBody.fromBytes(bytes, 200,
            headers: {Headers.contentTypeHeader: ['application/json']});
      });

      expect(
        () => client.query('auth.me', {}, (j) => j),
        throwsA(isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Unexpected response shape',
        )),
      );
    });

    test('missing json.message falls back to "Unknown error"', () async {
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody(
          [
            {
              'error': {
                'json': {'data': {}}
              }
            }
          ],
          statusCode: 500,
        );
      });

      expect(
        () => client.query('auth.me', {}, (j) => j),
        throwsA(
          isA<ApiException>()
              .having((e) => e.message, 'message', 'Unknown error'),
        ),
      );
    });
  });

  // -------------------------------------------------------------------------
  group('Timeout configuration', () {
    test('connectTimeout is 10 seconds', () {
      expect(client.dio.options.connectTimeout, const Duration(seconds: 10));
    });

    test('receiveTimeout is 20 seconds', () {
      expect(client.dio.options.receiveTimeout, const Duration(seconds: 20));
    });

    test('sendTimeout is 10 seconds', () {
      expect(client.dio.options.sendTimeout, const Duration(seconds: 10));
    });
  });

  // -------------------------------------------------------------------------
  group('401 refresh flow', () {
    test('on 401 with refresh token: refresh called and request retried',
        () async {
      when(() => tokens.accessToken).thenAnswer((_) async => 'old_access');
      when(() => tokens.refreshToken)
          .thenAnswer((_) async => 'valid_refresh');
      when(() => tokens.userId).thenAnswer((_) async => null);
      when(() => tokens.orgId).thenAnswer((_) async => null);

      when(
        () => tokens.save(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          userId: any(named: 'userId'),
          orgId: any(named: 'orgId'),
          outletId: any(named: 'outletId'),
        ),
      ).thenAnswer((_) async {});

      // After save, the new access token should be readable.
      when(() => tokens.accessToken).thenAnswer((_) async => 'new_access');

      var callCount = 0;
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((invoc) async {
        callCount++;
        final opts = invoc.positionalArguments.first as RequestOptions;

        // First call to the main endpoint → 401
        if (!opts.path.contains('auth.refresh') && callCount == 1) {
          return _responseBody({'error': 'unauthorized'}, statusCode: 401);
        }

        // Call to auth.refresh → success
        if (opts.path.contains('auth.refresh')) {
          return _responseBody([
            {
              'result': {
                'data': {
                  'json': {
                    'accessToken': 'new_access',
                    'refreshToken': 'new_refresh',
                    'orgId': 'org1',
                    'user': {'id': 'u1', 'outletId': 'out1'},
                  }
                }
              }
            }
          ]);
        }

        // Retry of original request → success
        return _responseBody(_trpcSuccess({'id': '1'}));
      });

      final result = await client.query('auth.me', {}, (j) => j);
      expect(result, {'id': '1'});

      verify(
        () => tokens.save(
          accessToken: 'new_access',
          refreshToken: 'new_refresh',
          userId: 'u1',
          orgId: 'org1',
          outletId: 'out1',
        ),
      ).called(1);
    });

    test('on 401 with null refresh token: tokens NOT cleared, error forwarded',
        () async {
      when(() => tokens.accessToken).thenAnswer((_) async => 'old_access');
      when(() => tokens.refreshToken).thenAnswer((_) async => null);

      when(() => adapter.fetch(any(), any(), any())).thenAnswer((_) async {
        return _responseBody({'error': 'unauthorized'}, statusCode: 401);
      });

      await expectLater(
        client.query('auth.me', {}, (j) => j),
        throwsA(anything),
      );

      verifyNever(() => tokens.clear());
    });

    test('on 401 with refresh failure: tokens cleared, original error rethrown',
        () async {
      when(() => tokens.accessToken).thenAnswer((_) async => 'old_access');
      when(() => tokens.refreshToken)
          .thenAnswer((_) async => 'valid_refresh');
      when(() => tokens.clear()).thenAnswer((_) async {});

      var callCount = 0;
      when(() => adapter.fetch(any(), any(), any())).thenAnswer((invoc) async {
        callCount++;
        final opts = invoc.positionalArguments.first as RequestOptions;

        if (opts.path.contains('auth.refresh')) {
          // Simulate refresh failure by throwing a network error.
          throw DioException(
            requestOptions: opts,
            type: DioExceptionType.connectionError,
            message: 'Network unreachable',
          );
        }

        // The main request → 401
        return _responseBody({'error': 'unauthorized'}, statusCode: 401);
      });

      await expectLater(
        client.query('auth.me', {}, (j) => j),
        throwsA(anything),
      );

      verify(() => tokens.clear()).called(1);
    });
  });
}
