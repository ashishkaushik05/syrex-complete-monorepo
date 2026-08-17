import 'package:flutter_test/flutter_test.dart';
import 'package:outlet_app/core/models/service_complaint.dart';

void main() {
  group('ComplaintDto.fromJson', () {
    final fullJson = {
      'id': 'complaint-uuid-001',
      'complaintNumber': 'SC-0042',
      'status': 'assigned',
      'title': 'Battery not charging',
      'description': 'Customer reports battery does not hold charge',
      'customerName': 'Ravi Kumar',
      'customerPhone': '9876543210',
      'resolutionNote': null,
      'createdAt': '2026-06-01T08:00:00Z',
      'assignedAsiName': 'John Doe',
      'resolvedAt': null,
      'lines': [],
      'assignments': [],
    };

    test('parses all fields correctly', () {
      final complaint = ComplaintDto.fromJson(fullJson);
      expect(complaint.id, equals('complaint-uuid-001'));
      expect(complaint.complaintNumber, equals('SC-0042'));
      expect(complaint.status, equals('assigned'));
      expect(complaint.title, equals('Battery not charging'));
      expect(complaint.description, equals('Customer reports battery does not hold charge'));
      expect(complaint.customerName, equals('Ravi Kumar'));
      expect(complaint.customerPhone, equals('9876543210'));
      expect(complaint.resolutionNote, isNull);
      expect(complaint.createdAt, equals('2026-06-01T08:00:00Z'));
      expect(complaint.assignedAsiName, equals('John Doe'));
      expect(complaint.lines, isEmpty);
      expect(complaint.assignments, isEmpty);
    });

    test('status field is required — missing throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('status');
      expect(() => ComplaintDto.fromJson(json), throwsA(anything));
    });

    test('id field is required — missing throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('id');
      expect(() => ComplaintDto.fromJson(json), throwsA(anything));
    });

    test('complaintNumber field is required — missing throws', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('complaintNumber');
      expect(() => ComplaintDto.fromJson(json), throwsA(anything));
    });

    test('lines absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('lines');
      final complaint = ComplaintDto.fromJson(json);
      expect(complaint.lines, isEmpty);
    });

    test('lines null defaults to empty list', () {
      final json = {...fullJson, 'lines': null};
      final complaint = ComplaintDto.fromJson(json);
      expect(complaint.lines, isEmpty);
    });

    test('assignments absent defaults to empty list', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('assignments');
      final complaint = ComplaintDto.fromJson(json);
      expect(complaint.assignments, isEmpty);
    });

    group('assignedAsiName derivation', () {
      test('uses top-level assignedAsiName when non-null', () {
        final json = {
          ...fullJson,
          'assignedAsiName': 'Primary ASI',
          'assignments': [
            {
              'asiUserName': 'Fallback ASI',
              'seUserName': null,
              'createdAt': '2026-06-01T09:00:00Z',
            }
          ],
        };
        final complaint = ComplaintDto.fromJson(json);
        // Primary field wins; assignments not consulted
        expect(complaint.assignedAsiName, equals('Primary ASI'));
      });

      test('falls back to most recent assignment asiName when top-level is null', () {
        final json = {
          ...fullJson,
          'assignedAsiName': null,
          'assignments': [
            {
              'asiUserName': 'First ASI',
              'seUserName': null,
              'createdAt': '2026-06-01T08:00:00Z',
            },
            {
              'asiUserName': 'Second ASI',
              'seUserName': null,
              'createdAt': '2026-06-02T08:00:00Z',
            },
          ],
        };
        final complaint = ComplaintDto.fromJson(json);
        // Reverse-iterate: most recent first = Second ASI
        expect(complaint.assignedAsiName, equals('Second ASI'));
      });

      test('skips assignments with null asiName in fallback', () {
        final json = {
          ...fullJson,
          'assignedAsiName': null,
          'assignments': [
            {
              'asiUserName': 'Only Valid ASI',
              'seUserName': null,
              'createdAt': '2026-06-01T08:00:00Z',
            },
            {
              'asiUserName': null,
              'seUserName': 'SE Name',
              'createdAt': '2026-06-02T08:00:00Z',
            },
          ],
        };
        final complaint = ComplaintDto.fromJson(json);
        // Second (most recent) has null asiName, first has 'Only Valid ASI'
        expect(complaint.assignedAsiName, equals('Only Valid ASI'));
      });

      test('assignedAsiName is null when no top-level value and no assignments', () {
        final json = {
          ...fullJson,
          'assignedAsiName': null,
          'assignments': [],
        };
        final complaint = ComplaintDto.fromJson(json);
        expect(complaint.assignedAsiName, isNull);
      });

      test('assignedAsiName is null when all assignments have null asiName', () {
        final json = {
          ...fullJson,
          'assignedAsiName': null,
          'assignments': [
            {'asiUserName': null, 'seUserName': 'SE-1', 'createdAt': null},
          ],
        };
        final complaint = ComplaintDto.fromJson(json);
        expect(complaint.assignedAsiName, isNull);
      });
    });

    test('resolvedAt nullable when JSON null', () {
      final complaint = ComplaintDto.fromJson({...fullJson, 'resolvedAt': null});
      expect(complaint.resolvedAt, isNull);
    });

    test('resolvedAt nullable when key absent', () {
      final json = Map<String, dynamic>.from(fullJson)..remove('resolvedAt');
      final complaint = ComplaintDto.fromJson(json);
      expect(complaint.resolvedAt, isNull);
    });
  });

  group('ComplaintAssignment.fromJson', () {
    test('reads asiName from JSON key "asiUserName" (not "asiName")', () {
      final json = {
        'asiUserName': 'Area Inspector Joe',
        'seUserName': 'Service Engineer Sam',
        'createdAt': '2026-06-01T09:00:00Z',
      };
      final assignment = ComplaintAssignment.fromJson(json);
      expect(assignment.asiName, equals('Area Inspector Joe'));
    });

    test('reads seName from JSON key "seUserName" (not "seName")', () {
      final json = {
        'asiUserName': 'ASI Name',
        'seUserName': 'SE Name',
        'createdAt': '2026-06-01T09:00:00Z',
      };
      final assignment = ComplaintAssignment.fromJson(json);
      expect(assignment.seName, equals('SE Name'));
    });

    test('asiName null when asiUserName is absent', () {
      final json = {
        'seUserName': 'SE Name',
        'createdAt': '2026-06-01T09:00:00Z',
      };
      final assignment = ComplaintAssignment.fromJson(json);
      expect(assignment.asiName, isNull);
    });

    test('seName null when seUserName is absent', () {
      final json = {
        'asiUserName': 'ASI Name',
        'createdAt': '2026-06-01T09:00:00Z',
      };
      final assignment = ComplaintAssignment.fromJson(json);
      expect(assignment.seName, isNull);
    });

    test('all fields null when empty JSON object', () {
      final assignment = ComplaintAssignment.fromJson({});
      expect(assignment.asiName, isNull);
      expect(assignment.seName, isNull);
      expect(assignment.createdAt, isNull);
    });

    test('createdAt parsed correctly', () {
      final json = {
        'asiUserName': null,
        'seUserName': null,
        'createdAt': '2026-06-05T12:00:00Z',
      };
      final assignment = ComplaintAssignment.fromJson(json);
      expect(assignment.createdAt, equals('2026-06-05T12:00:00Z'));
    });
  });

  group('ComplaintActivity.fromJson', () {
    test('actorName extracted from nested actor.name path', () {
      final json = {
        'actor': {'name': 'Admin User', 'id': 'user-001'},
        'action': 'status_changed',
        'note': 'Changed to assigned',
        'createdAt': '2026-06-01T10:00:00Z',
      };
      final activity = ComplaintActivity.fromJson(json);
      expect(activity.actorName, equals('Admin User'));
      expect(activity.action, equals('status_changed'));
      expect(activity.note, equals('Changed to assigned'));
      expect(activity.createdAt, equals('2026-06-01T10:00:00Z'));
    });

    test('actorName is null when actor key absent', () {
      final json = {
        'action': 'note_added',
        'note': 'Some note',
        'createdAt': '2026-06-01T10:00:00Z',
      };
      final activity = ComplaintActivity.fromJson(json);
      expect(activity.actorName, isNull);
    });

    test('actorName is null when actor is JSON null', () {
      final json = {
        'actor': null,
        'action': 'note_added',
        'createdAt': null,
      };
      final activity = ComplaintActivity.fromJson(json);
      expect(activity.actorName, isNull);
    });

    test('actorName is null when actor.name is absent', () {
      final json = {
        'actor': {'id': 'user-001'}, // no 'name' key
        'action': 'note_added',
        'createdAt': null,
      };
      final activity = ComplaintActivity.fromJson(json);
      expect(activity.actorName, isNull);
    });

    test('action field is required — missing throws', () {
      final json = {
        'actor': {'name': 'User'},
        'note': 'Some note',
        'createdAt': null,
      };
      expect(() => ComplaintActivity.fromJson(json), throwsA(anything));
    });

    test('note nullable when absent', () {
      final json = {
        'actor': {'name': 'User'},
        'action': 'assigned',
        'createdAt': null,
      };
      final activity = ComplaintActivity.fromJson(json);
      expect(activity.note, isNull);
    });
  });

  group('CreateComplaintInput.toJson', () {
    test('null fields omitted from JSON', () {
      final input = CreateComplaintInput(
        title: null,
        description: null,
        customerName: null,
        customerPhone: null,
        lines: [],
      );
      final json = input.toJson();
      expect(json.containsKey('title'), isFalse);
      expect(json.containsKey('description'), isFalse);
      expect(json.containsKey('customerName'), isFalse);
      expect(json.containsKey('customerPhone'), isFalse);
    });

    test('lines always present even if empty', () {
      final input = CreateComplaintInput(
        title: null,
        description: null,
        customerName: null,
        customerPhone: null,
        lines: [],
      );
      final json = input.toJson();
      expect(json.containsKey('lines'), isTrue);
      expect(json['lines'], equals([]));
    });

    test('non-null fields included in JSON', () {
      final input = CreateComplaintInput(
        title: 'Battery issue',
        description: 'Does not charge',
        customerName: 'Ravi Kumar',
        customerPhone: '9876543210',
        lines: [],
      );
      final json = input.toJson();
      expect(json['title'], equals('Battery issue'));
      expect(json['description'], equals('Does not charge'));
      expect(json['customerName'], equals('Ravi Kumar'));
      expect(json['customerPhone'], equals('9876543210'));
    });

    test('all nulls and empty lines produces {"lines": []}', () {
      final input = CreateComplaintInput(
        title: null,
        description: null,
        customerName: null,
        customerPhone: null,
        lines: [],
      );
      final json = input.toJson();
      expect(json, equals({'lines': []}));
    });

    test('lines with entries are serialized', () {
      final input = CreateComplaintInput(
        title: 'Fault',
        description: null,
        customerName: null,
        customerPhone: null,
        lines: [
          CreateComplaintLineInput(
            serialNumber: 'SRX12345678',
            productId: null,
            notes: null,
          ),
        ],
      );
      final json = input.toJson();
      expect(json['lines'], hasLength(1));
    });
  });

  group('CreateComplaintLineInput.toJson', () {
    test('null fields omitted from JSON', () {
      final line = CreateComplaintLineInput(
        serialNumber: null,
        productId: null,
        notes: null,
      );
      final json = line.toJson();
      expect(json, isEmpty);
    });

    test('non-null fields included', () {
      final line = CreateComplaintLineInput(
        serialNumber: 'SRX12345678',
        productId: 'prod-001',
        notes: 'Swollen battery',
      );
      final json = line.toJson();
      expect(json['serialNumber'], equals('SRX12345678'));
      expect(json['productId'], equals('prod-001'));
      expect(json['notes'], equals('Swollen battery'));
    });

    test('only non-null fields produce partial map', () {
      final line = CreateComplaintLineInput(
        serialNumber: 'SRX12345678',
        productId: null,
        notes: null,
      );
      final json = line.toJson();
      expect(json, equals({'serialNumber': 'SRX12345678'}));
    });
  });
}
