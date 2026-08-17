import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/auth/session_controller.dart';
import '../../core/api/outlet_portal_client.dart';
import '../../core/models/invoice.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/invoice_list_tile.dart';
import '../../shared/widgets/empty_state.dart';
import '../../app/theme_provider.dart';

final _invoicesProvider = FutureProvider.autoDispose.family<PagedInvoices, String>(
  (ref, outletId) => ref.read(outletPortalClientProvider).invoiceHistory(outletId),
);

class InvoicesListScreen extends ConsumerWidget {
  const InvoicesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final outletId = ref.watch(sessionControllerProvider).outletId;
    final invoicesAsync = ref.watch(_invoicesProvider(outletId));

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutletAppBar(title: 'Invoices', c: c),
          Expanded(
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () async => ref.invalidate(_invoicesProvider(outletId)),
              child: invoicesAsync.when(
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.description_outlined,
                          title: 'No invoices yet',
                          sub: 'Invoices raised against your orders will appear here.',
                          c: c,
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                    itemCount: page.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => InvoiceListTile(
                      invoice: page.items[i],
                      onTap: () => context.push('/invoices/${page.items[i].id}'),
                      c: c,
                    ),
                  );
                },
                loading: () => _Skeleton(c: c),
                error: (_, __) => Center(
                  child: Text('Failed to load invoices', style: TextStyle(color: c.textMute)),
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
        itemCount: 6,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, __) => Container(
          height: 88,
          decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(18)),
        ),
      );
}
