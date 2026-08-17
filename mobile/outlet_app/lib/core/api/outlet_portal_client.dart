import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import '../models/outlet.dart';
import '../models/order.dart';
import '../models/invoice.dart';
import '../models/dispatch.dart';

class OutletPortalClient {
  final ApiClient _api;
  const OutletPortalClient(this._api);

  Future<OutletSummaryDto> summary(String outletId) =>
      _api.query('outletPortal.summary', {'outletId': outletId},
          (j) => OutletSummaryDto.fromJson(j as Map<String, dynamic>));

  Future<OutletProfileDto> myProfile() =>
      _api.query('outletPortal.myProfile', {},
          (j) => OutletProfileDto.fromJson(j as Map<String, dynamic>));

  Future<PagedOrders> orderHistory(
    String outletId, {
    String? cursor,
    int limit = 20,
    String? status,
    String? q,
  }) =>
      _api.query('outletPortal.orderHistory', {
        'outletId': outletId,
        'limit': limit,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'status': status,
        if (q != null) 'q': q,
      }, (j) => PagedOrders.fromJson(j as Map<String, dynamic>));

  Future<OrderDto> orderDetail(String outletId, String orderId) =>
      _api.query('outletPortal.orderDetail', {'outletId': outletId, 'orderId': orderId},
          (j) => OrderDto.fromJson(j as Map<String, dynamic>));

  Future<PagedInvoices> invoiceHistory(
    String outletId, {
    String? cursor,
    int limit = 20,
    String? q,
  }) =>
      _api.query('outletPortal.invoiceHistory', {
        'outletId': outletId,
        'limit': limit,
        if (cursor != null) 'cursor': cursor,
        if (q != null) 'q': q,
      }, (j) => PagedInvoices.fromJson(j as Map<String, dynamic>));

  Future<InvoiceDetailDto> invoiceDetail(String outletId, String invoiceId) =>
      _api.query('outletPortal.invoiceDetail', {'outletId': outletId, 'invoiceId': invoiceId},
          (j) => InvoiceDetailDto.fromJson(j as Map<String, dynamic>));

  Future<PagedDispatches> dispatchHistory(
    String outletId, {
    String? cursor,
    int limit = 20,
  }) =>
      _api.query('outletPortal.dispatchHistory', {
        'outletId': outletId,
        'limit': limit,
        if (cursor != null) 'cursor': cursor,
      }, (j) => PagedDispatches.fromJson(j as Map<String, dynamic>));

  Future<DispatchDetailDto> dispatchDetail(String outletId, String dispatchId) =>
      _api.query('outletPortal.dispatchDetail', {'outletId': outletId, 'dispatchId': dispatchId},
          (j) => DispatchDetailDto.fromJson(j as Map<String, dynamic>));

  Future<void> cancel(String outletId, String orderId) =>
      _api.mutationVoid('outletPortal.cancel', {'outletId': outletId, 'orderId': orderId});

  Future<void> updateBilling({
    String? legalName,
    String? gstin,
    String? billingAddress1,
    String? billingAddress2,
    String? billingCity,
    String? billingState,
    String? billingPincode,
  }) =>
      _api.mutationVoid('outletPortal.updateBilling', {
        'legalName': legalName,
        'gstin': gstin,
        'billingAddress1': billingAddress1,
        'billingAddress2': billingAddress2,
        'billingCity': billingCity,
        'billingState': billingState,
        'billingPincode': billingPincode,
      });
}

final outletPortalClientProvider = Provider<OutletPortalClient>(
  (ref) => OutletPortalClient(ref.read(apiClientProvider)),
);
