import 'package:flutter_test/flutter_test.dart';
import 'package:service_mobile_app/core/auth/auth_models.dart';
import 'package:service_mobile_app/modules/service/models/service_models.dart';

ComplaintDetail complaint({
  String status = 'visit',
  String? verdict,
}) {
  return ComplaintDetail(
    id: 'complaint-1',
    number: 'CMP-2026-000001',
    status: status,
    issueCategory: 'Not charging',
    customerName: 'Customer',
    customerPhone: '9999999999',
    serials: const ['SERIAL-1'],
    assignedAsiName: 'ASI',
    assignedSeName: 'Engineer',
    updatedAt: DateTime(2026),
    description: 'Battery does not charge',
    lines: const [],
    assignments: const [],
    tests: verdict == null
        ? const []
        : [
            TestReport(
              verdict: verdict,
              summary: 'Done',
              createdAt: DateTime(2026),
            ),
          ],
    activities: const [],
    warrantyStatus: null,
  );
}

void main() {
  const asi = AuthUser(
    id: 'asi',
    name: 'ASI',
    email: 'asi@example.com',
    roleName: 'ASI',
    permissions: ['service:assign', 'service:retest'],
  );
  const engineer = AuthUser(
    id: 'se',
    name: 'Engineer',
    email: 'se@example.com',
    roleName: 'Service Engineer',
    permissions: ['service:workflow', 'service:form'],
  );

  test('role actions follow the server matrix', () {
    expect(actionsFor(asi, complaint()).canAssignEngineer, isTrue);
    expect(
      actionsFor(asi, complaint(status: 'test_result_submitted'))
          .canRequestRetest,
      isTrue,
    );
    expect(actionsFor(engineer, complaint()).canRunDiagnostic, isTrue);
    expect(
      actionsFor(
        engineer,
        complaint(status: 'test_result_submitted', verdict: 'failed'),
      ).canCloseTestedOk,
      isFalse,
    );
    expect(
      actionsFor(
        engineer,
        complaint(status: 'test_result_submitted', verdict: 'tested_ok'),
      ).canCloseTestedOk,
      isTrue,
    );
  });

  test('dynamic form validation checks required, number, and select fields', () {
    const template = FormTemplate(
      id: 'template',
      name: 'Diagnostic',
      description: null,
      fields: [
        FormFieldDefinition(
          key: 'voltage',
          label: 'Voltage',
          type: 'number',
          isRequired: true,
          rules: {},
        ),
        FormFieldDefinition(
          key: 'condition',
          label: 'Condition',
          type: 'select',
          isRequired: true,
          rules: {
            'options': ['good', 'bad']
          },
        ),
      ],
    );
    expect(validateForm(template, {}), {
      'voltage': 'Required',
      'condition': 'Required',
    });
    expect(validateForm(template, {
      'voltage': 'abc',
      'condition': 'unknown',
    }), {
      'voltage': 'Enter a valid number',
      'condition': 'Choose a valid option',
    });
    expect(validateForm(template, {
      'voltage': '12.6',
      'condition': 'good',
    }), isEmpty);
  });

  test('complaint page decoder preserves cursor and assigned SE name', () {
    final page = ComplaintPage.fromJson({
      'items': [
        {
          'id': 'c1',
          'complaintNumber': 'CMP-1',
          'status': 'assigned',
          'issueCategory': 'Battery',
          'customerName': 'Customer',
          'customerPhone': '12345',
          'serials': ['S1'],
          'assignedAsiName': 'ASI',
          'assignedSeName': 'Engineer',
          'updatedAt': '2026-06-12T00:00:00.000Z',
        }
      ],
      'nextCursor': 'cursor-2',
      'tabCounts': {'all': 2, 'assigned': 2},
    });
    expect(page.nextCursor, 'cursor-2');
    expect(page.items.single.assignedSeName, 'Engineer');
  });
}
