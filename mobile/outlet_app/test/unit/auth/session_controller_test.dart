// ignore_for_file: lines_longer_than_80_chars

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:outlet_app/core/api/api_client.dart';
import 'package:outlet_app/core/auth/session_controller.dart';
import 'package:outlet_app/core/auth/token_store.dart';
import 'package:outlet_app/core/models/session.dart';

// ---------------------------------------------------------------------------
// Fake ApiClient — mocktail cannot match generic methods, so we use a Fake.
// ---------------------------------------------------------------------------

class _FakeApiClient extends Fake implements ApiClient {
  // Per-test configurables
  dynamic queryReturn;
  Exception? queryThrows;
  dynamic mutationReturn;
  Exception? mutationThrows;
  Exception? mutationVoidThrows;

  // Captured for assertion
  Map<String, dynamic>? capturedMutationInput;

  @override
  Future<T> query<T>(
    String procedure,
    Map<String, dynamic> input,
    T Function(dynamic json) fromJson,
  ) async {
    if (queryThrows != null) throw queryThrows!;
    return fromJson(queryReturn);
  }

  @override
  Future<T> mutation<T>(
    String procedure,
    Map<String, dynamic> input,
    T Function(dynamic json) fromJson,
  ) async {
    capturedMutationInput = input;
    if (mutationThrows != null) throw mutationThrows!;
    return fromJson(mutationReturn);
  }

  @override
  Future<void> mutationVoid(
    String procedure,
    Map<String, dynamic> input,
  ) async {
    if (mutationVoidThrows != null) throw mutationVoidThrows!;
  }
}

// ---------------------------------------------------------------------------
// Mock TokenStore — non-generic methods, mocktail works fine.
// ---------------------------------------------------------------------------

class MockTokenStore extends Mock implements TokenStore {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// A minimal valid raw JSON map for a `SessionUser` as returned by `auth.me`.
Map<String, dynamic> _userJson({
  String id = 'u1',
  String email = 'test@example.com',
  String name = 'Test User',
  String userType = 'outlet',
  String? outletId = 'out1',
  List<String> permissions = const ['orders:read'],
}) =>
    {
      'id': id,
      'email': email,
      'name': name,
      'userType': userType,
      'outletId': outletId,
      'role': {'permissions': permissions},
    };

/// A minimal valid raw JSON map for an `auth.login` response.
Map<String, dynamic> _loginResponseJson({
  String accessToken = 'at_new',
  String refreshToken = 'rt_new',
  String? orgId = 'org1',
  Map<String, dynamic>? user,
}) =>
    {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'orgId': orgId,
      'user': user ?? _userJson(),
    };

/// Build a [ProviderContainer] with a [_FakeApiClient] and [MockTokenStore]
/// and return all three.
({
  ProviderContainer container,
  _FakeApiClient api,
  MockTokenStore tokens,
}) _buildContainer() {
  final api = _FakeApiClient();
  final tokens = MockTokenStore();

  final container = ProviderContainer(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      tokenStoreProvider.overrideWithValue(tokens),
    ],
  );

  return (container: container, api: api, tokens: tokens);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUpAll(() {
    // Fallback value needed for any() on SessionUser type.
    registerFallbackValue(const SessionUser(
      id: '', email: '', name: '', userType: '', permissions: [],
    ));
  });

  // -------------------------------------------------------------------------
  group('SessionState', () {
    test('isAuthenticated is true when accessToken and user are both non-null',
        () {
      final user = SessionUser.fromJson(_userJson());
      final state = SessionState(
        accessToken: 'tok',
        refreshToken: 'ref',
        orgId: 'org',
        user: user,
      );
      expect(state.isAuthenticated, isTrue);
    });

    test('isAuthenticated is true when accessToken is empty string and user is non-null',
        () {
      // Per spec: check is accessToken != null — empty string satisfies != null.
      final user = SessionUser.fromJson(_userJson());
      final state = SessionState(accessToken: '', user: user);
      expect(state.isAuthenticated, isTrue);
    });

    test('isAuthenticated is false when accessToken is null', () {
      final user = SessionUser.fromJson(_userJson());
      final state = SessionState(user: user);
      expect(state.isAuthenticated, isFalse);
    });

    test('isAuthenticated is false when user is null', () {
      final state = SessionState(accessToken: 'tok');
      expect(state.isAuthenticated, isFalse);
    });

    test('SessionState.empty has all null fields and isAuthenticated false',
        () {
      expect(SessionState.empty.accessToken, isNull);
      expect(SessionState.empty.refreshToken, isNull);
      expect(SessionState.empty.orgId, isNull);
      expect(SessionState.empty.user, isNull);
      expect(SessionState.empty.isAuthenticated, isFalse);
    });

    test('SessionState.empty.outletId is empty string', () {
      expect(SessionState.empty.outletId, '');
    });
  });

  // -------------------------------------------------------------------------
  group('restoreSession', () {
    late ProviderContainer container;
    late _FakeApiClient api;
    late MockTokenStore tokens;

    setUp(() {
      final ctx = _buildContainer();
      container = ctx.container;
      api = ctx.api;
      tokens = ctx.tokens;
    });

    tearDown(() => container.dispose());

    test('no stored token → state remains unauthenticated, no API call made',
        () async {
      when(() => tokens.hasSession).thenAnswer((_) async => false);

      final notifier =
          container.read(sessionControllerProvider.notifier);
      await notifier.restoreSession();

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      // No query should have been made.
      expect(api.queryReturn, isNull);
    });

    test('valid token + successful auth.me → state transitions to authenticated',
        () async {
      when(() => tokens.hasSession).thenAnswer((_) async => true);
      when(() => tokens.accessToken).thenAnswer((_) async => 'at');
      when(() => tokens.refreshToken).thenAnswer((_) async => 'rt');
      when(() => tokens.orgId).thenAnswer((_) async => 'org1');
      when(() => tokens.saveUser(any())).thenAnswer((_) async {});
      when(() => tokens.cachedUser).thenAnswer((_) async => null);

      api.queryReturn = _userJson();

      final notifier =
          container.read(sessionControllerProvider.notifier);
      await notifier.restoreSession();

      final state = container.read(sessionControllerProvider);
      expect(state.isAuthenticated, isTrue);
      expect(state.accessToken, 'at');
      expect(state.refreshToken, 'rt');
      expect(state.orgId, 'org1');
      expect(state.user?.id, 'u1');
      expect(state.user?.email, 'test@example.com');
    });

    test('valid token + auth.me throws 401 → tokens cleared, state unauthenticated',
        () async {
      when(() => tokens.hasSession).thenAnswer((_) async => true);
      when(() => tokens.clear()).thenAnswer((_) async {});
      when(() => tokens.cachedUser).thenAnswer((_) async => null);

      api.queryThrows = const ApiException('Unauthorized', statusCode: 401);

      final notifier =
          container.read(sessionControllerProvider.notifier);
      await notifier.restoreSession(); // must not propagate

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      verify(() => tokens.clear()).called(1);
    });

    test('valid token + network error → offline restore attempted, tokens NOT cleared, state unauthenticated',
        () async {
      when(() => tokens.hasSession).thenAnswer((_) async => true);
      // No cached user → falls through to empty state.
      when(() => tokens.cachedUser).thenAnswer((_) async => null);

      api.queryThrows = Exception('Network unreachable');

      final notifier =
          container.read(sessionControllerProvider.notifier);
      // Should NOT throw.
      await expectLater(notifier.restoreSession(), completes);

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      // Tokens are NOT cleared on network error — only cleared on confirmed 401.
      verifyNever(() => tokens.clear());
    });
  });

  // -------------------------------------------------------------------------
  group('login', () {
    late ProviderContainer container;
    late _FakeApiClient api;
    late MockTokenStore tokens;

    setUp(() {
      final ctx = _buildContainer();
      container = ctx.container;
      api = ctx.api;
      tokens = ctx.tokens;
    });

    tearDown(() => container.dispose());

    test('successful login → tokens saved, state transitions to authenticated',
        () async {
      api.mutationReturn = _loginResponseJson();

      when(
        () => tokens.save(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          userId: any(named: 'userId'),
          orgId: any(named: 'orgId'),
          outletId: any(named: 'outletId'),
        ),
      ).thenAnswer((_) async {});
      when(() => tokens.saveUser(any())).thenAnswer((_) async {});

      final notifier =
          container.read(sessionControllerProvider.notifier);
      await notifier.login('test@example.com', 'password123');

      final state = container.read(sessionControllerProvider);
      expect(state.isAuthenticated, isTrue);
      expect(state.accessToken, 'at_new');
      expect(state.refreshToken, 'rt_new');
      expect(state.orgId, 'org1');

      verify(
        () => tokens.save(
          accessToken: 'at_new',
          refreshToken: 'rt_new',
          userId: 'u1',
          orgId: 'org1',
          outletId: 'out1',
        ),
      ).called(1);
    });

    test('login sends correct email and password in mutation input', () async {
      api.mutationReturn = _loginResponseJson();

      when(
        () => tokens.save(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          userId: any(named: 'userId'),
          orgId: any(named: 'orgId'),
          outletId: any(named: 'outletId'),
        ),
      ).thenAnswer((_) async {});
      when(() => tokens.saveUser(any())).thenAnswer((_) async {});

      final notifier =
          container.read(sessionControllerProvider.notifier);
      await notifier.login('admin@syrex.local', 'admin123');

      // The fake captures the last mutation input directly.
      expect(api.capturedMutationInput?['email'], 'admin@syrex.local');
      expect(api.capturedMutationInput?['password'], 'admin123');
    });

    test('login with null orgId in response defaults to empty string', () async {
      api.mutationReturn = _loginResponseJson(orgId: null);

      when(
        () => tokens.save(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          userId: any(named: 'userId'),
          orgId: any(named: 'orgId'),
          outletId: any(named: 'outletId'),
        ),
      ).thenAnswer((_) async {});
      when(() => tokens.saveUser(any())).thenAnswer((_) async {});

      final notifier =
          container.read(sessionControllerProvider.notifier);
      await notifier.login('test@example.com', 'pass');

      final state = container.read(sessionControllerProvider);
      expect(state.orgId, '');
    });

    test('login failure (401) → throws, tokens NOT cleared, state remains unauthenticated',
        () async {
      api.mutationThrows =
          const ApiException('Invalid credentials', statusCode: 401);

      final notifier =
          container.read(sessionControllerProvider.notifier);

      await expectLater(
        notifier.login('bad@example.com', 'wrong'),
        throwsA(isA<ApiException>()),
      );

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      verifyNever(() => tokens.clear());
      verifyNever(
        () => tokens.save(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          userId: any(named: 'userId'),
          orgId: any(named: 'orgId'),
          outletId: any(named: 'outletId'),
        ),
      );
    });

    test('login network error → throws, state remains unauthenticated',
        () async {
      api.mutationThrows = Exception('Timeout');

      final notifier =
          container.read(sessionControllerProvider.notifier);

      await expectLater(
        notifier.login('test@example.com', 'pass'),
        throwsA(anything),
      );

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
    });
  });

  // -------------------------------------------------------------------------
  group('logout', () {
    late ProviderContainer container;
    late _FakeApiClient api;
    late MockTokenStore tokens;

    setUp(() {
      final ctx = _buildContainer();
      container = ctx.container;
      api = ctx.api;
      tokens = ctx.tokens;
    });

    tearDown(() => container.dispose());

    /// Helper: bring the session into an authenticated state directly.
    Future<void> _seedAuthenticatedState() async {
      api.mutationReturn = _loginResponseJson();

      when(
        () => tokens.save(
          accessToken: any(named: 'accessToken'),
          refreshToken: any(named: 'refreshToken'),
          userId: any(named: 'userId'),
          orgId: any(named: 'orgId'),
          outletId: any(named: 'outletId'),
        ),
      ).thenAnswer((_) async {});
      when(() => tokens.saveUser(any())).thenAnswer((_) async {});

      await container
          .read(sessionControllerProvider.notifier)
          .login('test@example.com', 'pass');

      // Reset for the next call (logout).
      api.mutationReturn = null;
      api.mutationThrows = null;
    }

    test('server call succeeds → tokens cleared, state unauthenticated',
        () async {
      await _seedAuthenticatedState();

      when(() => tokens.clear()).thenAnswer((_) async {});
      // mutationVoidThrows is null → logout void call succeeds.

      await container.read(sessionControllerProvider.notifier).logout();

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      verify(() => tokens.clear()).called(1);
    });

    test('server call fails → tokens still cleared, state still unauthenticated',
        () async {
      await _seedAuthenticatedState();

      api.mutationVoidThrows = Exception('Server error');
      when(() => tokens.clear()).thenAnswer((_) async {});

      // Must not propagate the exception.
      await expectLater(
        container.read(sessionControllerProvider.notifier).logout(),
        completes,
      );

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      verify(() => tokens.clear()).called(1);
    });

    test('after logout, isAuthenticated is false', () async {
      await _seedAuthenticatedState();

      when(() => tokens.clear()).thenAnswer((_) async {});

      await container.read(sessionControllerProvider.notifier).logout();

      final state = container.read(sessionControllerProvider);
      expect(state.isAuthenticated, isFalse);
    });

    test('logout from already-unauthenticated state → still succeeds', () async {
      // No login — start from empty.
      when(() => tokens.clear()).thenAnswer((_) async {});

      await expectLater(
        container.read(sessionControllerProvider.notifier).logout(),
        completes,
      );

      expect(container.read(sessionControllerProvider).isAuthenticated,
          isFalse);
      verify(() => tokens.clear()).called(1);
    });
  });
}
