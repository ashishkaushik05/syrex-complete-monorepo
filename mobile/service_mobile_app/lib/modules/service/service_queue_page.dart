import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/config/polling.dart';
import '../../core/widgets/async_state_views.dart';
import 'controllers/service_controllers.dart';

class ServiceQueuePage extends ConsumerStatefulWidget {
  const ServiceQueuePage({super.key});

  @override
  ConsumerState<ServiceQueuePage> createState() => _ServiceQueuePageState();
}

class _ServiceQueuePageState extends ConsumerState<ServiceQueuePage>
    with WidgetsBindingObserver {
  Timer? _poll;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startPolling();
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(serviceQueuePollInterval, (_) {
      ref.read(queueControllerProvider.notifier).refresh();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(queueControllerProvider.notifier).refresh();
      _startPolling();
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _searchDebounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(queueControllerProvider);
    final session = ref.watch(sessionControllerProvider);
    final controller = ref.read(queueControllerProvider.notifier);
    const statuses = [
      'all',
      'raised',
      'assigned',
      'visit',
      'test_result_submitted',
      'retest_requested',
      'resolved',
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('${session.user?.roleName ?? 'Service'} queue'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: controller.refresh,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Logout',
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              key: const Key('queueSearch'),
              decoration: const InputDecoration(
                hintText: 'Search complaint, customer, SKU or serial',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                _searchDebounce?.cancel();
                _searchDebounce = Timer(
                  const Duration(milliseconds: 350),
                  () => controller.search(value),
                );
              },
            ),
          ),
          SizedBox(
            height: 52,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              scrollDirection: Axis.horizontal,
              children: statuses.map((status) {
                final count = state.counts[status] ?? 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text('${_label(status)} ($count)'),
                    selected: state.status == status,
                    onSelected: (_) => controller.setStatus(status),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: controller.refresh,
              child: _queueBody(context, state),
            ),
          ),
        ],
      ),
    );
  }

  Widget _queueBody(BuildContext context, QueueState state) {
    if (state.isLoading && state.items.isEmpty) {
      return const LoadingView(label: 'Loading assigned work...');
    }
    if (state.error != null && state.items.isEmpty) {
      return ErrorView(
        error: state.error!,
        onRetry: ref.read(queueControllerProvider.notifier).refresh,
      );
    }
    if (state.items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 200),
          EmptyView(message: 'No assigned complaints match this queue.'),
        ],
      );
    }
    return ListView.builder(
      key: const Key('queueList'),
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(12),
      itemCount: state.items.length + (state.nextCursor == null ? 0 : 1),
      itemBuilder: (context, index) {
        if (index == state.items.length) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton.tonal(
              key: const Key('loadMoreButton'),
              onPressed: state.isLoadingMore
                  ? null
                  : ref.read(queueControllerProvider.notifier).loadMore,
              child: Text(state.isLoadingMore ? 'Loading...' : 'Load more'),
            ),
          );
        }
        final item = state.items[index];
        return Card(
          child: ListTile(
            title: Text('${item.number} · ${item.issueCategory}'),
            subtitle: Text([
              item.customerName,
              item.serials.join(', '),
              item.assignedSeName == null ? null : 'SE: ${item.assignedSeName}',
            ].whereType<String>().join('\n')),
            trailing: Chip(label: Text(_label(item.status))),
            onTap: () => context.push('/service/complaint/${item.id}'),
          ),
        );
      },
    );
  }

  String _label(String value) => value
      .split('_')
      .map((word) =>
          word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');
}
