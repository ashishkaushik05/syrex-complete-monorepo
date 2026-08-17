import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../models/service_complaint.dart';

class ServiceClient {
  final ApiClient _api;
  const ServiceClient(this._api);

  Future<PagedComplaints> listComplaints({
    String? cursor,
    int limit = 20,
    String? status,
  }) =>
      _api.query('serviceComplaints.list', {
        'limit': limit,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'status': status,
      }, (j) => PagedComplaints.fromJson(j as Map<String, dynamic>));

  Future<ComplaintDto> getComplaint(String id) =>
      _api.query('serviceComplaints.detail', {'id': id},
          (j) => ComplaintDto.fromJson(j as Map<String, dynamic>));

  Future<ComplaintDto> createComplaint(CreateComplaintInput input) =>
      _api.mutation('serviceComplaints.create', input.toJson(),
          (j) => ComplaintDto.fromJson(j as Map<String, dynamic>));

  Future<ComplaintDto> updateComplaint(
    String id, {
    String? description,
    String? notes,
  }) =>
      _api.mutation('serviceComplaints.update', {
        'id': id,
        if (description != null) 'description': description,
      }, (j) => ComplaintDto.fromJson(j as Map<String, dynamic>));
}

final serviceClientProvider = Provider<ServiceClient>(
  (ref) => ServiceClient(ref.read(apiClientProvider)),
);
