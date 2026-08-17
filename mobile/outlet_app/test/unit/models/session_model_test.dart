import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/session.dart';

void main() {
  group('SessionUser.fromJson', () {
    final validJson = {
      'id': 'user-uuid-001',
      'email': 'outlet@syrex.local',
      'name': 'Ashish Kaushik',
      'userType': 'outlet',
      'outletId': 'outlet-uuid-001',
      'role': {
        'permissions': ['orders:read', 'orders:write'],
      },
    };

    test('parses all required fields correctly', () {
      final user = SessionUser.fromJson(validJson);
      expect(user.id, equals('user-uuid-001'));
      expect(user.email, equals('outlet@syrex.local'));
      expect(user.name, equals('Ashish Kaushik'));
      expect(user.userType, equals('outlet'));
      expect(user.outletId, equals('outlet-uuid-001'));
      expect(user.permissions, equals(['orders:read', 'orders:write']));
    });

    test('missing id throws TypeError', () {
      final json = Map<String, dynamic>.from(validJson)..remove('id');
      expect(() => SessionUser.fromJson(json), throwsA(isA<TypeError>()));
    });

    test('missing email throws TypeError', () {
      final json = Map<String, dynamic>.from(validJson)..remove('email');
      expect(() => SessionUser.fromJson(json), throwsA(isA<TypeError>()));
    });

    test('missing name throws TypeError', () {
      final json = Map<String, dynamic>.from(validJson)..remove('name');
      expect(() => SessionUser.fromJson(json), throwsA(isA<TypeError>()));
    });

    test('missing userType throws TypeError', () {
      final json = Map<String, dynamic>.from(validJson)..remove('userType');
      expect(() => SessionUser.fromJson(json), throwsA(isA<TypeError>()));
    });

    test('permissions are sourced from role.permissions, not top-level', () {
      final json = {
        ...validJson,
        'permissions': ['top-level-perm'], // should be ignored
        'role': {
          'permissions': ['role-level-perm'],
        },
      };
      final user = SessionUser.fromJson(json);
      expect(user.permissions, equals(['role-level-perm']));
      expect(user.permissions, isNot(contains('top-level-perm')));
    });

    test('missing role key results in empty permissions list', () {
      final json = Map<String, dynamic>.from(validJson)..remove('role');
      final user = SessionUser.fromJson(json);
      expect(user.permissions, equals([]));
    });

    test('role present but missing permissions key defaults to empty list', () {
      final json = {
        ...validJson,
        'role': <String, dynamic>{},
      };
      final user = SessionUser.fromJson(json);
      expect(user.permissions, equals([]));
    });

    test('outletId null is stored as null (String?)', () {
      final json = Map<String, dynamic>.from(validJson);
      json['outletId'] = null;
      final user = SessionUser.fromJson(json);
      expect(user.outletId, isNull);
    });

    test('outletId missing key results in null', () {
      final json = Map<String, dynamic>.from(validJson)..remove('outletId');
      final user = SessionUser.fromJson(json);
      expect(user.outletId, isNull);
    });
  });

  group('SessionState', () {
    test('isAuthenticated is true when both accessToken and user are non-null', () {
      final user = SessionUser.fromJson({
        'id': 'u1',
        'email': 'e@e.com',
        'name': 'Test',
        'userType': 'outlet',
        'role': {'permissions': []},
      });
      final state = SessionState(accessToken: 'token123', user: user);
      expect(state.isAuthenticated, isTrue);
    });

    test('isAuthenticated is true when accessToken is empty string and user is non-null', () {
      // Empty string is not null; the check is != null only
      final user = SessionUser.fromJson({
        'id': 'u1',
        'email': 'e@e.com',
        'name': 'Test',
        'userType': 'outlet',
        'role': {'permissions': []},
      });
      final state = SessionState(accessToken: '', user: user);
      expect(state.isAuthenticated, isTrue);
    });

    test('isAuthenticated is false when accessToken is null', () {
      final user = SessionUser.fromJson({
        'id': 'u1',
        'email': 'e@e.com',
        'name': 'Test',
        'userType': 'outlet',
        'role': {'permissions': []},
      });
      final state = SessionState(accessToken: null, user: user);
      expect(state.isAuthenticated, isFalse);
    });

    test('isAuthenticated is false when user is null', () {
      final state = SessionState(accessToken: 'some-token', user: null);
      expect(state.isAuthenticated, isFalse);
    });

    test('isAuthenticated is false when both accessToken and user are null', () {
      const state = SessionState.empty;
      expect(state.isAuthenticated, isFalse);
    });

    test('SessionState.empty has all fields null', () {
      const state = SessionState.empty;
      expect(state.accessToken, isNull);
      expect(state.refreshToken, isNull);
      expect(state.orgId, isNull);
      expect(state.user, isNull);
    });

    test('SessionState.empty.outletId is empty string', () {
      const state = SessionState.empty;
      expect(state.outletId, equals(''));
    });

    test('outletId returns empty string when user is null', () {
      const state = SessionState(accessToken: null);
      expect(state.outletId, equals(''));
    });

    test('outletId returns empty string when user.outletId is null', () {
      final user = SessionUser.fromJson({
        'id': 'u1',
        'email': 'e@e.com',
        'name': 'Test',
        'userType': 'outlet',
        'outletId': null,
        'role': {'permissions': []},
      });
      final state = SessionState(accessToken: 'tok', user: user);
      expect(state.outletId, equals(''));
    });

    test('outletId returns the user outletId when present', () {
      final user = SessionUser.fromJson({
        'id': 'u1',
        'email': 'e@e.com',
        'name': 'Test',
        'userType': 'outlet',
        'outletId': 'outlet-abc',
        'role': {'permissions': []},
      });
      final state = SessionState(accessToken: 'tok', user: user);
      expect(state.outletId, equals('outlet-abc'));
    });
  });
}
