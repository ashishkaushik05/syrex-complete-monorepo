import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_error.dart';
import '../models/service_models.dart';
import '../repository/service_repository.dart';

class QueueState {
  const QueueState({
    this.items = const [],
    this.counts = const {},
    this.status = 'all',
    this.query = '',
    this.nextCursor,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  final List<ComplaintSummary> items;
  final Map<String, int> counts;
  final String status;
  final String query;
  final String? nextCursor;
  final bool isLoading;
  final bool isLoadingMore;
  final AppError? error;

  QueueState copyWith({
    List<ComplaintSummary>? items,
    Map<String, int>? counts,
    String? status,
    String? query,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoading,
    bool? isLoadingMore,
    AppError? error,
    bool clearError = false,
  }) {
    return QueueState(
      items: items ?? this.items,
      counts: counts ?? this.counts,
      status: status ?? this.status,
      query: query ?? this.query,
      nextCursor: clearCursor ? null : nextCursor ?? this.nextCursor,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : error ?? this.error,
    );
  }
}

class QueueController extends StateNotifier<QueueState> {
  QueueController(this.repository) : super(const QueueState()) {
    refresh();
  }

  final ServiceRepository repository;
  int _refreshGeneration = 0;

  Future<void> refresh() async {
    final generation = ++_refreshGeneration;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final page = await repository.listComplaints(
        status: state.status,
        query: state.query,
      );
      if (generation != _refreshGeneration) return;
      state = state.copyWith(
        items: page.items,
        counts: page.counts,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        isLoading: false,
      );
    } catch (error) {
      if (generation != _refreshGeneration) return;
      state = state.copyWith(
        isLoading: false,
        error: AppError.from(error),
      );
    }
  }

  Future<void> loadMore() async {
    if (state.nextCursor == null || state.isLoadingMore) return;
    final generation = _refreshGeneration;
    final cursor = state.nextCursor;
    final status = state.status;
    final query = state.query;
    state = state.copyWith(isLoadingMore: true, clearError: true);
    try {
      final page = await repository.listComplaints(
        status: status,
        query: query,
        cursor: cursor,
      );
      if (generation != _refreshGeneration) return;
      state = state.copyWith(
        items: [...state.items, ...page.items],
        counts: page.counts,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        isLoadingMore: false,
      );
    } catch (error) {
      if (generation != _refreshGeneration) return;
      state = state.copyWith(
        isLoadingMore: false,
        error: AppError.from(error),
      );
    }
  }

  Future<void> setStatus(String status) async {
    state = state.copyWith(status: status, items: const [], clearCursor: true);
    await refresh();
  }

  Future<void> search(String query) async {
    state = state.copyWith(query: query, items: const [], clearCursor: true);
    await refresh();
  }
}

final queueControllerProvider =
    StateNotifierProvider<QueueController, QueueState>((ref) {
  return QueueController(ref.watch(serviceRepositoryProvider));
});

class ComplaintBundle {
  const ComplaintBundle({
    required this.detail,
    required this.submissions,
    required this.stagedEvidence,
  });

  final ComplaintDetail detail;
  final List<FormSubmission> submissions;
  final List<EvidenceSummary> stagedEvidence;
}

final complaintBundleProvider =
    FutureProvider.family<ComplaintBundle, String>((ref, complaintId) async {
  final repository = ref.watch(serviceRepositoryProvider);
  final values = await Future.wait([
    repository.detail(complaintId),
    repository.submissions(complaintId),
    repository.stagedEvidence(complaintId),
  ]);
  return ComplaintBundle(
    detail: values[0] as ComplaintDetail,
    submissions: values[1] as List<FormSubmission>,
    stagedEvidence: values[2] as List<EvidenceSummary>,
  );
});
