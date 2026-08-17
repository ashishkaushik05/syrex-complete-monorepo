// ignore_for_file: lines_longer_than_80_chars

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:outlet_app/core/auth/token_store.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockFlutterSecureStorage extends Mock implements FlutterSecureStorage {}

// ---------------------------------------------------------------------------
// Key constants (must match the implementation exactly)
// ---------------------------------------------------------------------------

const _kAccess = 'outlet_access_token';
const _kRefresh = 'outlet_refresh_token';
const _kUserId = 'outlet_user_id';
const _kOrgId = 'outlet_org_id';
const _kOutletId = 'outlet_outlet_id';
const _kCachedUser = 'outlet_cached_user';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late MockFlutterSecureStorage storage;
  late TokenStore store;

  setUp(() {
    storage = MockFlutterSecureStorage();
    store = TokenStore.withStorage(storage);
  });

  // -------------------------------------------------------------------------
  group('Storage keys', () {
    test('save() writes exactly the 5 expected keys', () async {
      when(() => storage.write(key: any(named: 'key'), value: any(named: 'value')))
          .thenAnswer((_) async {});

      await store.save(
        accessToken: 'at',
        refreshToken: 'rt',
        userId: 'uid',
        orgId: 'oid',
        outletId: 'outid',
      );

      verify(() => storage.write(key: _kAccess, value: 'at')).called(1);
      verify(() => storage.write(key: _kRefresh, value: 'rt')).called(1);
      verify(() => storage.write(key: _kUserId, value: 'uid')).called(1);
      verify(() => storage.write(key: _kOrgId, value: 'oid')).called(1);
      verify(() => storage.write(key: _kOutletId, value: 'outid')).called(1);

      // No extra writes beyond those 5.
      verifyNoMoreInteractions(storage);
    });

    test('clear() deletes all 6 expected keys (including cached user)', () async {
      when(() => storage.delete(key: any(named: 'key')))
          .thenAnswer((_) async {});

      await store.clear();

      verify(() => storage.delete(key: _kAccess)).called(1);
      verify(() => storage.delete(key: _kRefresh)).called(1);
      verify(() => storage.delete(key: _kUserId)).called(1);
      verify(() => storage.delete(key: _kOrgId)).called(1);
      verify(() => storage.delete(key: _kOutletId)).called(1);
      verify(() => storage.delete(key: _kCachedUser)).called(1);

      verifyNoMoreInteractions(storage);
    });
  });

  // -------------------------------------------------------------------------
  group('Individual getters read the correct key', () {
    test('accessToken reads outlet_access_token', () async {
      when(() => storage.read(key: _kAccess)).thenAnswer((_) async => 'tok');

      final result = await store.accessToken;
      expect(result, 'tok');
      verify(() => storage.read(key: _kAccess)).called(1);
    });

    test('refreshToken reads outlet_refresh_token', () async {
      when(() => storage.read(key: _kRefresh)).thenAnswer((_) async => 'ref');

      final result = await store.refreshToken;
      expect(result, 'ref');
      verify(() => storage.read(key: _kRefresh)).called(1);
    });

    test('userId reads outlet_user_id', () async {
      when(() => storage.read(key: _kUserId)).thenAnswer((_) async => 'u1');

      final result = await store.userId;
      expect(result, 'u1');
      verify(() => storage.read(key: _kUserId)).called(1);
    });

    test('orgId reads outlet_org_id', () async {
      when(() => storage.read(key: _kOrgId)).thenAnswer((_) async => 'org1');

      final result = await store.orgId;
      expect(result, 'org1');
      verify(() => storage.read(key: _kOrgId)).called(1);
    });

    test('outletId reads outlet_outlet_id', () async {
      when(() => storage.read(key: _kOutletId))
          .thenAnswer((_) async => 'out1');

      final result = await store.outletId;
      expect(result, 'out1');
      verify(() => storage.read(key: _kOutletId)).called(1);
    });

    test('getters return null when key is absent', () async {
      when(() => storage.read(key: any(named: 'key')))
          .thenAnswer((_) async => null);

      expect(await store.accessToken, isNull);
      expect(await store.refreshToken, isNull);
      expect(await store.userId, isNull);
      expect(await store.orgId, isNull);
      expect(await store.outletId, isNull);
    });
  });

  // -------------------------------------------------------------------------
  group('hasSession', () {
    test('returns true when outlet_access_token is non-null and non-empty',
        () async {
      when(() => storage.read(key: _kAccess))
          .thenAnswer((_) async => 'valid_token');

      expect(await store.hasSession, isTrue);
    });

    test('returns false when outlet_access_token is null', () async {
      when(() => storage.read(key: _kAccess)).thenAnswer((_) async => null);

      expect(await store.hasSession, isFalse);
    });

    test('returns false when outlet_access_token is empty string', () async {
      when(() => storage.read(key: _kAccess)).thenAnswer((_) async => '');

      expect(await store.hasSession, isFalse);
    });

    test('does NOT check refresh token or any other key', () async {
      when(() => storage.read(key: _kAccess))
          .thenAnswer((_) async => 'valid_token');

      await store.hasSession;

      // Only the access token key should have been read.
      verify(() => storage.read(key: _kAccess)).called(1);
      verifyNever(() => storage.read(key: _kRefresh));
      verifyNever(() => storage.read(key: _kUserId));
      verifyNever(() => storage.read(key: _kOrgId));
      verifyNever(() => storage.read(key: _kOutletId));
    });
  });

  // -------------------------------------------------------------------------
  group('save() writes all 5 keys concurrently (Future.wait pattern)', () {
    test('all 5 write calls are made regardless of individual ordering',
        () async {
      final writtenKeys = <String>[];

      when(
        () => storage.write(
            key: any(named: 'key'), value: any(named: 'value')),
      ).thenAnswer((invocation) async {
        writtenKeys.add(invocation.namedArguments[const Symbol('key')] as String);
      });

      await store.save(
        accessToken: 'a',
        refreshToken: 'r',
        userId: 'u',
        orgId: 'o',
        outletId: 'oo',
      );

      // All 5 keys must be present (order is irrelevant — Future.wait).
      expect(writtenKeys, containsAll([
        _kAccess,
        _kRefresh,
        _kUserId,
        _kOrgId,
        _kOutletId,
      ]));
      expect(writtenKeys.length, 5);
    });
  });

  // -------------------------------------------------------------------------
  group('clear() deletes all 5 keys concurrently (Future.wait pattern)', () {
    test('all 5 delete calls are made', () async {
      final deletedKeys = <String>[];

      when(() => storage.delete(key: any(named: 'key'))).thenAnswer(
        (invocation) async {
          deletedKeys
              .add(invocation.namedArguments[const Symbol('key')] as String);
        },
      );

      await store.clear();

      expect(deletedKeys, containsAll([
        _kAccess,
        _kRefresh,
        _kUserId,
        _kOrgId,
        _kOutletId,
        _kCachedUser,
      ]));
      expect(deletedKeys.length, 6);
    });
  });
}
