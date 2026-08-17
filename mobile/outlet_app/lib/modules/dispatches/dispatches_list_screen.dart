import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/dispatch.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/dispatch_list_tile.dart';
import '../../shared/widgets/empty_state.dart';
import '../../app/theme_provider.dart';

final _dispatchesProvider = FutureProvider.autoDispose.family<PagedDispatches, String>(
  (ref, outletId) => ref.read(outletPortalClientProvider).dispatchHistory(outletId),
);

class DispatchesListScreen extends ConsumerWidget {
  const DispatchesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final outletId = ref.watch(sessionControllerProvider).outletId;
    final dispatchesAsync = ref.watch(_dispatchesProvider(outletId));

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutletAppBar(title: 'Dispatches', c: c),
          Expanded(
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () async => ref.invalidate(_dispatchesProvider(outletId)),
              child: dispatchesAsync.when(
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.local_shipping_outlined,
                          title: 'No dispatches yet',
                          sub: 'Shipments linked to your orders will appear here.',
                          c: c,
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                    itemCount: page.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => DispatchListTile(
                      dispatch: page.items[i],
                      onTap: () => context.push('/dispatches/${page.items[i].id}'),
                      c: c,
                    ),
                  );
                },
                loading: () => _Skeleton(c: c),
                error: (_, __) => Center(
                  child: Text('Failed to load dispatches', style: TextStyle(color: c.textMute)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  final AppThemeColors c;
  const _Skeleton({required this.c});

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        itemCount: 5,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, __) => Container(
          height: 106,
          decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(18)),
        ),
      );
}
