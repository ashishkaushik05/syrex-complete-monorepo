import '../../../core/auth/auth_models.dart';

class ComplaintSummary {
  const ComplaintSummary({
    required this.id,
    required this.number,
    required this.status,
    required this.issueCategory,
    required this.customerName,
    required this.customerPhone,
    required this.serials,
    required this.assignedAsiName,
    required this.assignedSeName,
    required this.updatedAt,
  });

  final String id;
  final String number;
  final String status;
  final String issueCategory;
  final String? customerName;
  final String? customerPhone;
  final List<String> serials;
  final String? assignedAsiName;
  final String? assignedSeName;
  final DateTime updatedAt;

  factory ComplaintSummary.fromJson(Map<String, dynamic> json) {
    return ComplaintSummary(
      id: _requiredString(json, 'id'),
      number: _requiredString(json, 'complaintNumber'),
      status: _requiredString(json, 'status'),
      issueCategory: json['issueCategory']?.toString() ?? '',
      customerName: json['customerName']?.toString(),
      customerPhone: json['customerPhone']?.toString(),
      serials: (json['serials'] as List? ?? const [])
          .map((value) => value.toString())
          .toList(),
      assignedAsiName: json['assignedAsiName']?.toString(),
      assignedSeName: json['assignedSeName']?.toString(),
      updatedAt: _requiredDate(json, 'updatedAt'),
    );
  }
}

class ComplaintPage {
  const ComplaintPage({
    required this.items,
    required this.nextCursor,
    required this.counts,
  });

  final List<ComplaintSummary> items;
  final String? nextCursor;
  final Map<String, int> counts;

  factory ComplaintPage.fromJson(Map<String, dynamic> json) {
    return ComplaintPage(
      items: (json['items'] as List? ?? const [])
          .map((row) => ComplaintSummary.fromJson(
                Map<String, dynamic>.from(row as Map),
              ))
          .toList(),
      nextCursor: json['nextCursor']?.toString(),
      counts: Map<String, dynamic>.from(json['tabCounts'] as Map? ?? const {})
          .map((key, value) => MapEntry(key, (value as num).toInt())),
    );
  }
}

class ComplaintLine {
  const ComplaintLine({
    required this.id,
    required this.sku,
    required this.serialNumber,
  });

  final String id;
  final String sku;
  final String serialNumber;

  factory ComplaintLine.fromJson(Map<String, dynamic> json) => ComplaintLine(
        id: _requiredString(json, 'id'),
        sku: json['sku']?.toString() ?? '',
        serialNumber: json['serialNumber']?.toString() ?? '',
      );
}

class Assignment {
  const Assignment({
    required this.asiName,
    required this.seName,
    required this.action,
    required this.createdAt,
  });

  final String? asiName;
  final String? seName;
  final String action;
  final DateTime createdAt;

  factory Assignment.fromJson(Map<String, dynamic> json) => Assignment(
        asiName: json['asiUserName']?.toString(),
        seName: json['seUserName']?.toString(),
        action: _requiredString(json, 'action'),
        createdAt: _requiredDate(json, 'createdAt'),
      );
}

class TestReport {
  const TestReport({
    required this.verdict,
    required this.summary,
    required this.createdAt,
  });

  final String verdict;
  final String? summary;
  final DateTime createdAt;

  factory TestReport.fromJson(Map<String, dynamic> json) => TestReport(
        verdict: _requiredString(json, 'verdict'),
        summary: json['summary']?.toString(),
        createdAt: _requiredDate(json, 'createdAt'),
      );
}

class Activity {
  const Activity({
    required this.action,
    required this.note,
    required this.createdAt,
  });

  final String action;
  final String? note;
  final DateTime createdAt;

  factory Activity.fromJson(Map<String, dynamic> json) => Activity(
        action: _requiredString(json, 'action'),
        note: json['note']?.toString(),
        createdAt: _requiredDate(json, 'createdAt'),
      );
}

class ComplaintDetail extends ComplaintSummary {
  const ComplaintDetail({
    required super.id,
    required super.number,
    required super.status,
    required super.issueCategory,
    required super.customerName,
    required super.customerPhone,
    required super.serials,
    required super.assignedAsiName,
    required super.assignedSeName,
    required super.updatedAt,
    required this.description,
    required this.lines,
    required this.assignments,
    required this.tests,
    required this.activities,
    required this.warrantyStatus,
  });

  final String? description;
  final List<ComplaintLine> lines;
  final List<Assignment> assignments;
  final List<TestReport> tests;
  final List<Activity> activities;
  final String? warrantyStatus;

  TestReport? get latestTest => tests.isEmpty ? null : tests.first;

  factory ComplaintDetail.fromJson(Map<String, dynamic> json) {
    final summary = ComplaintSummary.fromJson(json);
    final warranty = json['warrantyDecision'] as Map?;
    return ComplaintDetail(
      id: summary.id,
      number: summary.number,
      status: summary.status,
      issueCategory: summary.issueCategory,
      customerName: summary.customerName,
      customerPhone: summary.customerPhone,
      serials: summary.serials,
      assignedAsiName: summary.assignedAsiName,
      assignedSeName: summary.assignedSeName,
      updatedAt: summary.updatedAt,
      description: json['description']?.toString(),
      lines: _rows(json['lines'], ComplaintLine.fromJson),
      assignments: _rows(json['assignments'], Assignment.fromJson),
      tests: _rows(json['tests'], TestReport.fromJson),
      activities: _rows(json['activities'], Activity.fromJson),
      warrantyStatus: warranty?['status']?.toString(),
    );
  }
}

List<T> _rows<T>(
  dynamic value,
  T Function(Map<String, dynamic>) decoder,
) {
  return (value as List? ?? const [])
      .map((row) => decoder(Map<String, dynamic>.from(row as Map)))
      .toList();
}

class FormFieldDefinition {
  const FormFieldDefinition({
    required this.key,
    required this.label,
    required this.type,
    required this.isRequired,
    required this.rules,
  });

  final String key;
  final String label;
  final String type;
  final bool isRequired;
  final Map<String, dynamic> rules;

  factory FormFieldDefinition.fromJson(Map<String, dynamic> json) {
    return FormFieldDefinition(
      key: _requiredString(json, 'fieldKey'),
      label: _requiredString(json, 'label'),
      type: _requiredString(json, 'fieldType'),
      isRequired: json['isRequired'] == true,
      rules: Map<String, dynamic>.from(
        json['validationRules'] as Map? ?? const {},
      ),
    );
  }
}

class FormTemplate {
  const FormTemplate({
    required this.id,
    required this.name,
    required this.description,
    required this.fields,
  });

  final String id;
  final String name;
  final String? description;
  final List<FormFieldDefinition> fields;

  factory FormTemplate.fromJson(Map<String, dynamic> json) => FormTemplate(
        id: _requiredString(json, 'id'),
        name: _requiredString(json, 'name'),
        description: json['description']?.toString(),
        fields: _rows(json['fields'], FormFieldDefinition.fromJson),
      );
}

class EvidenceSummary {
  const EvidenceSummary({
    required this.id,
    required this.fileName,
    required this.mimeType,
  });

  final String id;
  final String fileName;
  final String mimeType;

  factory EvidenceSummary.fromJson(Map<String, dynamic> json) => EvidenceSummary(
        id: _requiredString(json, 'id'),
        fileName: _requiredString(json, 'fileName'),
        mimeType: _requiredString(json, 'mimeType'),
      );
}

class FormSubmission {
  const FormSubmission({
    required this.templateName,
    required this.submittedAt,
    required this.evidence,
  });

  final String templateName;
  final DateTime submittedAt;
  final List<EvidenceSummary> evidence;

  factory FormSubmission.fromJson(Map<String, dynamic> json) => FormSubmission(
        templateName: _requiredString(json, 'templateName'),
        submittedAt: _requiredDate(json, 'submittedAt'),
        evidence: _rows(json['attachments'], EvidenceSummary.fromJson),
      );
}

class ServiceEngineer {
  const ServiceEngineer({required this.id, required this.name});

  final String id;
  final String name;

  factory ServiceEngineer.fromJson(Map<String, dynamic> json) =>
      ServiceEngineer(
        id: _requiredString(json, 'id'),
        name: _requiredString(json, 'name'),
      );
}

class ServiceActions {
  const ServiceActions({
    this.canAssignEngineer = false,
    this.canRequestRetest = false,
    this.canLogVisit = false,
    this.canRunDiagnostic = false,
    this.canCloseTestedOk = false,
  });

  final bool canAssignEngineer;
  final bool canRequestRetest;
  final bool canLogVisit;
  final bool canRunDiagnostic;
  final bool canCloseTestedOk;
}

ServiceActions actionsFor(AuthUser user, ComplaintDetail complaint) {
  const closed = {'resolved', 'telephonic_closure', 'cancelled'};
  if (user.isAsi) {
    return ServiceActions(
      canAssignEngineer: !closed.contains(complaint.status),
      canRequestRetest: complaint.status == 'test_result_submitted',
    );
  }
  if (user.isServiceEngineer) {
    return ServiceActions(
      canLogVisit:
          complaint.status == 'assigned' || complaint.status == 'retest_requested',
      canRunDiagnostic: complaint.status == 'visit',
      canCloseTestedOk: complaint.status == 'test_result_submitted' &&
          complaint.latestTest?.verdict == 'tested_ok',
    );
  }
  return const ServiceActions();
}

Map<String, String> validateForm(
  FormTemplate template,
  Map<String, String> values,
) {
  final errors = <String, String>{};
  for (final field in template.fields) {
    final raw = values[field.key]?.trim() ?? '';
    if (field.isRequired && raw.isEmpty) {
      errors[field.key] = 'Required';
      continue;
    }
    if (raw.isEmpty) continue;
    if (field.type == 'number' && num.tryParse(raw) == null) {
      errors[field.key] = 'Enter a valid number';
    }
    if (field.type == 'decimal' && double.tryParse(raw) == null) {
      errors[field.key] = 'Enter a valid number';
    }
    if (field.type == 'date' && DateTime.tryParse(raw) == null) {
      errors[field.key] = 'Select a valid date';
    }
    if (field.type == 'select') {
      final options = (field.rules['options'] as List? ?? const [])
          .map((value) => value.toString());
      if (!options.contains(raw)) errors[field.key] = 'Choose a valid option';
    }
  }
  return errors;
}

String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) return value;
  throw FormatException('Missing or invalid $key');
}

DateTime _requiredDate(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String) {
    final parsed = DateTime.tryParse(value);
    if (parsed != null) return parsed;
  }
  throw FormatException('Missing or invalid $key');
}
