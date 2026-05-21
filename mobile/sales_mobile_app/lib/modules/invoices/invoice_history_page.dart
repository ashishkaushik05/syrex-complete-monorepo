import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/sales_client.dart';
import '../../shared/widgets/premium_surfaces.dart';

class _InvoicesListState {
  const _InvoicesListState({
    this.items = const [],
    this.nextCursor,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  final List<SalesInvoice> items;
  final String? nextCursor;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;

  _InvoicesListState copyWith({
    List<SalesInvoice>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool clearError = false,
  }) =>
      _InvoicesListState(
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        error: clearError ? null : (error ?? this.error),
      );
}

class _InvoicesNotifier
    extends AutoDisposeFamilyNotifier<_InvoicesListState, String?> {
  @override
  _InvoicesListState build(String? arg) {
    _fetch();
    return const _InvoicesListState(isLoading: true);
  }

  Future<void> _fetch() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final result = await ref.read(salesClientProvider).invoices(q: arg);
      state = state.copyWith(
        items: result.items,
        nextCursor: result.nextCursor,
        clearCursor: result.nextCursor == null,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.nextCursor == null || state.isLoadingMore) return;
    final cursor = state.nextCursor;
    state = state.copyWith(isLoadingMore: true);
    try {
      final result =
          await ref.read(salesClientProvider).invoices(q: arg, cursor: cursor);
      state = state.copyWith(
        items: [...state.items, ...result.items],
        nextCursor: result.nextCursor,
        clearCursor: result.nextCursor == null,
        isLoadingMore: false,
      );
    } catch (_) {
      state = state.copyWith(isLoadingMore: false);
    }
  }

  Future<void> refresh() async {
    state = const _InvoicesListState(isLoading: true);
    await _fetch();
  }
}

final _invoicesNotifierProvider = NotifierProvider.autoDispose
    .family<_InvoicesNotifier, _InvoicesListState, String?>(
  _InvoicesNotifier.new,
);

class InvoiceHistoryPage extends ConsumerStatefulWidget {
  const InvoiceHistoryPage({super.key});

  @override
  ConsumerState<InvoiceHistoryPage> createState() => _InvoiceHistoryPageState();
}

class _InvoiceHistoryPageState extends ConsumerState<InvoiceHistoryPage> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  String? _q;

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
      ref.read(_invoicesNotifierProvider(_q).notifier).loadMore();
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(_invoicesNotifierProvider(_q));

    return PremiumGradientBackground(
      child: RefreshIndicator(
        onRefresh: () => ref.read(_invoicesNotifierProvider(_q).notifier).refresh(),
        child: CustomScrollView(
          controller: _scrollCtrl,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Finance',
                      style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: AppPalette.ink),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Invoices and payment-relevant read views',
                      style: TextStyle(color: Color(0xFF5F6E7C)),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _searchCtrl,
                      decoration: InputDecoration(
                        hintText: 'Search invoice/order number',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: _searchCtrl.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear),
                                onPressed: () {
                                  _searchCtrl.clear();
                                  setState(() => _q = null);
                                },
                              )
                            : null,
                      ),
                      onChanged: (v) => setState(() => _q = v.isEmpty ? null : v),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
            if (state.isLoading)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (state.error != null)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyStateView(
                    title: 'Could not load invoices',
                    subtitle: 'Pull to refresh when network is stable.',
                    icon: Icons.receipt_long_outlined,
                  ),
                ),
              )
            else if (state.items.isEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: EmptyStateView(
                    title: 'No invoices found',
                    subtitle: 'No finance records match your current search.',
                    icon: Icons.search_off_outlined,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                sliver: SliverList.separated(
                  itemCount: state.items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _InvoiceCard(invoice: state.items[i]),
                ),
              ),
            if (state.isLoadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (!state.isLoading && state.nextCursor != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  child: OutlinedButton(
                    onPressed: () =>
                        ref.read(_invoicesNotifierProvider(_q).notifier).loadMore(),
                    child: const Text('Load More'),
                  ),
                ),
              )
            else
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final SalesInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse(invoice.invoiceDate);
    final dateStr =
        date != null ? '${date.day}/${date.month}/${date.year}' : invoice.invoiceDate;
    final due = double.tryParse(invoice.amountDue) ?? 0;

    return PremiumCard(
      margin: const EdgeInsets.only(bottom: 0),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(invoice.invoiceNumber,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(dateStr),
        trailing: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('₹${invoice.total}',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            StateBadge(
              label: due <= 0 ? 'PAID' : 'DUE ₹${invoice.amountDue}',
              color: due <= 0 ? AppPalette.mint : AppPalette.rose,
            ),
          ],
        ),
        onTap: () => context.push('/finance/invoices/${invoice.id}'),
      ),
    );
  }
}
