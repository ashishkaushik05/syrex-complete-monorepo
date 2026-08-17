import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:service_mobile_app/core/auth/auth_models.dart';
import 'package:service_mobile_app/core/auth/session_controller.dart';
import 'package:service_mobile_app/core/network/api_client.dart';
import 'package:service_mobile_app/modules/service/controllers/service_controllers.dart';
import 'package:service_mobile_app/modules/service/models/service_models.dart';
import 'package:service_mobile_app/modules/service/repository/service_repository.dart';
import 'package:service_mobile_app/modules/service/service_detail_page.dart';
import 'package:service_mobile_app/modules/service/service_queue_page.dart';
import 'package:service_mobile_app/modules/service/service_test_capture_page.dart';

const asi = AuthUser(
  id: 'asi',
  name: 'ASI',
  email: 'asi@example.com',
  roleName: 'ASI',
  permissions: ['service:read', 'service:assign', 'service:retest'],
);
const engineer = AuthUser(
  id: 'se',
  name: 'Engineer',
  email: 'se@example.com',
  roleName: 'Service Engineer',
  permissions: ['service:read', 'service:workflow', 'service:form'],
);

class FixedSessionController extends SessionController {
  FixedSessionController(this.fixedUser);
  final AuthUser fixedUser;

  @override
  SessionState build() => SessionState(
        status: SessionStatus.authenticated,
        user: fixedUser,
      );
}

class FakeRepository extends ServiceRepository {
  FakeRepository() : super(TrpcClient(Dio()));

  @override
  Future<ComplaintPage> listComplaints({
    String? status,
    String? query,
    String? cursor,
  }) async {
    return ComplaintPage(
      items: cursor == null ? [_summary('1')] : [_summary('2')],
      nextCursor: cursor == null ? 'next' : null,
      counts: const {'all': 2, 'assigned': 2},
    );
  }

  ComplaintSummary _summary(String id) => ComplaintSummary(
        id: id,
        number: 'CMP-$id',
        status: 'assigned',
        issueCategory: 'Not charging',
        customerName: 'Customer',
        customerPhone: '9999999999',
        serials: const ['SERIAL-1'],
        assignedAsiName: 'ASI',
        assignedSeName: 'Engineer',
        updatedAt: DateTime(2026),
      );

  @override
  Future<List<FormTemplate>> templates() async => const [
        FormTemplate(
          id: 'template-1',
          name: 'Battery diagnostic',
          description: null,
          fields: [
            FormFieldDefinition(
              key: 'inspection_date',
              label: 'Inspection date',
              type: 'date',
              isRequired: true,
              rules: {},
            ),
            FormFieldDefinition(
              key: 'invoice_available',
              label: 'Purchase invoice available',
              type: 'boolean',
              isRequired: true,
              rules: {},
            ),
            FormFieldDefinition(
              key: 'battery_application',
              label: 'Battery application',
              type: 'select',
              isRequired: true,
              rules: {
                'options': ['Automotive', 'Inverter'],
              },
            ),
            FormFieldDefinition(
              key: 'voltage',
              label: 'Voltage',
              type: 'number',
              isRequired: true,
              rules: {},
            ),
          ],
        ),
      ];
}

ComplaintBundle bundle({String status = 'assigned', String? verdict}) {
  return ComplaintBundle(
    detail: ComplaintDetail(
      id: 'complaint-1',
      number: 'CMP-1',
      status: status,
      issueCategory: 'Not charging',
      customerName: 'Customer',
      customerPhone: '9999999999',
      serials: const ['SERIAL-1'],
      assignedAsiName: 'ASI',
      assignedSeName: 'Engineer',
      updatedAt: DateTime(2026),
      description: 'Battery does not charge',
      lines: const [
        ComplaintLine(id: 'line-1', sku: 'SKU-1', serialNumber: 'SERIAL-1'),
      ],
      assignments: const [],
      tests: verdict == null
          ? const []
          : [
              TestReport(
                verdict: verdict,
                summary: 'Done',
                createdAt: DateTime(2026),
              )
            ],
      activities: const [],
      warrantyStatus: null,
    ),
    submissions: const [],
    stagedEvidence: const [],
  );
}

void main() {
  testWidgets('queue renders assigned rows and cursor load-more',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        serviceRepositoryProvider.overrideWithValue(FakeRepository()),
        sessionControllerProvider.overrideWith(
          () => FixedSessionController(engineer),
        ),
      ],
      child: const MaterialApp(home: ServiceQueuePage()),
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('CMP-1'), findsOneWidget);
    expect(find.byKey(const Key('loadMoreButton')), findsOneWidget);
    await tester.tap(find.byKey(const Key('loadMoreButton')));
    await tester.pumpAndSettle();
    expect(find.textContaining('CMP-2'), findsOneWidget);
  });

  testWidgets('ASI detail exposes assignment but not SE workflow actions',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        sessionControllerProvider.overrideWith(
          () => FixedSessionController(asi),
        ),
        complaintBundleProvider.overrideWith(
          (ref, id) async => bundle(status: 'assigned'),
        ),
      ],
      child: const MaterialApp(
        home: ServiceDetailPage(complaintId: 'complaint-1'),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('assignEngineerButton')),
      300,
    );
    expect(find.byKey(const Key('assignEngineerButton')), findsOneWidget);
    expect(find.byKey(const Key('logVisitButton')), findsNothing);
    expect(find.byKey(const Key('diagnosticButton')), findsNothing);
  });

  testWidgets('detail refreshes when the app returns to the foreground',
      (tester) async {
    var loads = 0;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        sessionControllerProvider.overrideWith(
          () => FixedSessionController(asi),
        ),
        complaintBundleProvider.overrideWith((ref, id) async {
          loads += 1;
          return bundle(status: 'assigned');
        }),
      ],
      child: const MaterialApp(
        home: ServiceDetailPage(complaintId: 'complaint-1'),
      ),
    ));
    await tester.pumpAndSettle();
    expect(loads, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(loads, 2);
  });

  testWidgets('SE diagnostic renders dynamic field and evidence controls',
      (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        serviceRepositoryProvider.overrideWithValue(FakeRepository()),
      ],
      child: const MaterialApp(
        home: ServiceTestCapturePage(complaintId: 'complaint-1'),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('field_inspection_date')), findsOneWidget);
    expect(find.text('Select date'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    expect(find.byKey(const Key('field_voltage')), findsOneWidget);
    expect(find.byKey(const Key('cameraButton')), findsOneWidget);
    expect(find.byKey(const Key('galleryButton')), findsOneWidget);
  });
}
