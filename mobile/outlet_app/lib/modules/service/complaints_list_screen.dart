import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/api/service_client.dart';
import '../../core/models/service_complaint.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/status_badge.dart';
import '../../shared/widgets/empty_state.dart';
import '../../shared/widgets/app_card.dart';
import '../../shared/widgets/filter_chip_row.dart';
import '../../app/theme_provider.dart';

final _complaintsProvider =
    FutureProvider.autoDispose.family<PagedComplaints, String?>(
  (ref, status) => ref.read(serviceClientProvider).listComplaints(
        status: status,
      ),
);

class ComplaintsListScreen extends ConsumerStatefulWidget {
  const ComplaintsListScreen({super.key});

  @override
  ConsumerState<ComplaintsListScreen> createState() => _ComplaintsListScreenState();
}

class _ComplaintsListScreenState extends ConsumerState<ComplaintsListScreen> {
  String _filter = 'all';

  static const _chips = ['all', 'raised', 'assigned', 'visit', 'resolved', 'cancelled'];

  @override
  Widget build(BuildContext context) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final statusArg = _filter == 'all' ? null : _filter;
    final complaintsAsync = ref.watch(_complaintsProvider(statusArg));

    return Scaffold(
      backgroundColor: c.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutletAppBar(title: 'Service', c: c, showBack: true),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
            child: FilterChipRow(
              chips: _chips,
              selected: _filter,
              onSelect: (f) => setState(() => _filter = f),
              c: c,
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () async => ref.invalidate(_complaintsProvider(statusArg)),
              child: complaintsAsync.when(
                data: (page) {
                  if (page.items.isEmpty) {
                    return ListView(
                      children: [
                        EmptyState(
                          icon: Icons.build_circle_outlined,
                          title: 'No complaints',
                          sub: 'Service complaints you raise will appear here.',
                          c: c,
                          actionLabel: 'Raise a complaint',
                          onAction: () => context.push('/more/service/new'),
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                    itemCount: page.items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _ComplaintTile(
                      complaint: page.items[i],
                      onTap: () => context.push('/more/service/${page.items[i].id}'),
                      c: c,
                    ),
                  );
                },
                loading: () => _Skeleton(c: c),
                error: (_, __) => Center(
                  child: Text('Failed to load complaints', style: TextStyle(color: c.textMute)),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/more/service/new'),
        backgroundColor: c.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Raise complaint'),
      ),
    );
  }
}

class _ComplaintTile extends StatelessWidget {
  final ComplaintDto complaint;
  final VoidCallback onTap;
  final AppThemeColors c;
  const _ComplaintTile({required this.complaint, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      c: c,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('#${complaint.complaintNumber}', style: AppTextStyles.itemTitle(color: c.text)),
              ),
              StatusBadge(status: complaint.status, c: c),
            ],
          ),
          if (complaint.title != null) ...[
            const SizedBox(height: 6),
            Text(complaint.title!, style: AppTextStyles.label(color: c.textMute), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.calendar_today_outlined, size: 13, color: c.textFaint),
              const SizedBox(width: 5),
              Text(fmtDateStr(complaint.createdAt), style: AppTextStyles.smallLabel(color: c.textFaint)),
              if (complaint.assignedAsiName != null) ...[
                const SizedBox(width: 12),
                Icon(Icons.person_outline, size: 13, color: c.textFaint),
                const SizedBox(width: 5),
                Text(complaint.assignedAsiName!, style: AppTextStyles.smallLabel(color: c.textFaint)),
              ],
            ],
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
          height: 84,
          decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(18)),
        ),
      );
}
