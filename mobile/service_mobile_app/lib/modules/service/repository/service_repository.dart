import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/network/api_client.dart';
import '../models/service_models.dart';

class ServiceRepository {
  ServiceRepository(this.client);

  final TrpcClient client;

  Future<ComplaintPage> listComplaints({
    String? status,
    String? query,
    String? cursor,
  }) async {
    final result = await client.query('serviceComplaints.list', {
      'limit': 20,
      if (status != null && status != 'all') 'status': status,
      if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
      if (cursor != null) 'cursor': cursor,
    }) as Map<String, dynamic>;
    return ComplaintPage.fromJson(result);
  }

  Future<ComplaintDetail> detail(String complaintId) async {
    final result = await client.query(
      'serviceComplaints.detail',
      {'id': complaintId},
    ) as Map<String, dynamic>;
    return ComplaintDetail.fromJson(result);
  }

  Future<List<FormSubmission>> submissions(String complaintId) async {
    final result = await client.query('serviceForms.listSubmissions', {
      'complaintId': complaintId,
      'limit': 100,
    }) as Map<String, dynamic>;
    return (result['items'] as List? ?? const [])
        .map((row) => FormSubmission.fromJson(
              Map<String, dynamic>.from(row as Map),
            ))
        .toList();
  }

  Future<List<EvidenceSummary>> stagedEvidence(String complaintId) async {
    final result = await client.query('attachments.list', {
      'entityType': 'service_complaint',
      'entityId': complaintId,
      'isConfirmed': true,
      'limit': 100,
    }) as Map<String, dynamic>;
    return (result['items'] as List? ?? const [])
        .map((row) => EvidenceSummary.fromJson(
              Map<String, dynamic>.from(row as Map),
            ))
        .toList();
  }

  Future<List<ServiceEngineer>> serviceEngineers() async {
    final result = await client.query(
      'serviceAssignments.candidates',
    ) as Map<String, dynamic>;
    return (result['serviceEngineers'] as List? ?? const [])
        .map((row) => ServiceEngineer.fromJson(
              Map<String, dynamic>.from(row as Map),
            ))
        .toList();
  }

  Future<List<FormTemplate>> templates() async {
    final result = await client.query('serviceForms.listTemplates', {
      'isActive': true,
      'withFields': true,
      'limit': 100,
    }) as Map<String, dynamic>;
    return (result['items'] as List? ?? const [])
        .map((row) => FormTemplate.fromJson(
              Map<String, dynamic>.from(row as Map),
            ))
        .toList();
  }

  Future<void> assignEngineer(String complaintId, String engineerId) async {
    await client.mutate('serviceAssignments.reassign', {
      'complaintId': complaintId,
      'seUserId': engineerId,
    });
  }

  Future<void> requestRetest(String complaintId, String note) async {
    await client.mutate('serviceTests.requestRetest', {
      'complaintId': complaintId,
      'note': note,
    });
  }

  Future<void> logVisit(String complaintId) async {
    await client.mutate('serviceComplaints.transition', {
      'id': complaintId,
      'action': 'visit_logged',
    });
  }

  Future<void> closeTestedOk(String complaintId) async {
    await client.mutate('serviceComplaints.transition', {
      'id': complaintId,
      'action': 'tested_ok_close',
      'note': 'Closed from service mobile after tested-ok report',
    });
  }

  Future<String> uploadEvidence(String complaintId, XFile image) async {
    final bytes = await image.readAsBytes();
    final mimeType = image.mimeType ?? _mimeForName(image.name);
    final pending = await client.mutate('attachments.createPending', {
      'entityType': 'service_complaint',
      'entityId': complaintId,
      'fileName': image.name,
      'mimeType': mimeType,
      'fileSize': bytes.length,
      'expiresInMinutes': 15,
    }) as Map<String, dynamic>;
    final attachment = pending['attachment'] as Map<String, dynamic>;
    final upload = pending['upload'] as Map<String, dynamic>;
    try {
      final uploadClient = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 15),
        sendTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 30),
      ));
      await uploadClient.put(
        upload['uploadUrl'].toString(),
        data: Stream.value(bytes),
        options: Options(
          headers: {
            'Content-Type': mimeType,
            'Content-Length': bytes.length,
          },
        ),
      );
      await client.mutate('attachments.confirm', {
        'attachmentId': attachment['id'].toString(),
      });
      return attachment['id'].toString();
    } catch (error) {
      throw AppError(AppErrorType.upload, AppError.from(error).message);
    }
  }

  Future<void> removeStagedEvidence(String attachmentId) async {
    await client.mutate('attachments.remove', {'id': attachmentId});
  }

  Future<void> submitForm({
    required String complaintId,
    required String templateId,
    required Map<String, String> values,
    required List<String> attachmentIds,
  }) async {
    await client.mutate('serviceForms.submitForm', {
      'complaintId': complaintId,
      'templateId': templateId,
      'values': values.entries
          .map((entry) => {
                'fieldKey': entry.key,
                'rawValue': entry.value,
              })
          .toList(),
      'attachmentIds': attachmentIds,
    });
  }

  Future<void> submitTest({
    required String complaintId,
    required String verdict,
    required String summary,
  }) async {
    await client.mutate('serviceTests.submit', {
      'complaintId': complaintId,
      'verdict': verdict,
      'summary': summary.trim(),
    });
  }

  String _mimeForName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }
}

final serviceRepositoryProvider = Provider<ServiceRepository>((ref) {
  return ServiceRepository(ref.watch(trpcClientProvider));
});
