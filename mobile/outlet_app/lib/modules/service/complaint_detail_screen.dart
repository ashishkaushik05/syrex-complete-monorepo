import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/utils/formatters.dart';
import '../../core/api/service_client.dart';
import '../../core/models/service_complaint.dart';
import '../../shared/widgets/outlet_app_bar.dart';
import '../../shared/widgets/status_badge.dart';
import '../../shared/widgets/kv_row.dart';
import '../../shared/widgets/app_card.dart';
import '../../app/theme_provider.dart';

final _complaintDetailProvider = FutureProvider.autoDispose.family<ComplaintDto, String>(
  (ref, id) => ref.read(serviceClientProvider).getComplaint(id),
);

class ComplaintDetailScreen extends ConsumerWidget {
  final String complaintId;
  const ComplaintDetailScreen({super.key, required this.complaintId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dark = ref.watch(themeModeProvider) == ThemeMode.dark;
    final c = AppThemeColors(dark: dark);
    final complaintAsync = ref.watch(_complaintDetailProvider(complaintId));

    return Scaffold(
      backgroundColor: c.bg,
      body: complaintAsync.when(
        data: (comp) => _Body(complaint: comp, c: c, ref: ref),
        loading: () => _Loading(c: c),
        error: (_, __) => Center(child: Text('Failed to load complaint', style: TextStyle(color: c.textMute))),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final ComplaintDto complaint;
  final AppThemeColors c;
  final WidgetRef ref;
  const _Body({required this.complaint, required this.c, required this.ref});

  void _refresh() => ref.invalidate(_complaintDetailProvider(complaint.id));

  @override
  Widget build(BuildContext context) {
    final isResolved = complaint.status == 'resolved' ||
        complaint.status == 'telephonic_closure' ||
        complaint.status == 'cancelled';

    return RefreshIndicator(
      color: c.accent,
      onRefresh: () async => _refresh(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: OutletAppBar(
              title: '#${complaint.complaintNumber}',
              subtitle: 'SERVICE',
              c: c,
              showBack: true,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  StatusBadge(status: complaint.status, c: c),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: _refresh,
                    child: Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: c.line),
                      ),
                      child: Icon(Icons.refresh_rounded, size: 18, color: c.textMute),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // ── Issue description ──────────────────────────
                if (complaint.title != null || complaint.description != null)
                  AppCard(
                    c: c,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (complaint.title != null) ...[
                          Text(complaint.title!, style: AppTextStyles.bodyHeavy(color: c.text)),
                          const SizedBox(height: 6),
                        ],
                        if (complaint.description != null)
                          Text(complaint.description!, style: AppTextStyles.label(color: c.textMute)),
                      ],
                    ),
                  ),

                const SizedBox(height: 14),

                // ── Meta info ──────────────────────────────────
                AppCard(
                  c: c,
                  child: Column(
                    children: [
                      KVRow(label: 'Raised on', value: fmtDateStr(complaint.createdAt), c: c),
                      if (complaint.customerName != null)
                        KVRow(label: 'Customer', value: complaint.customerName!, c: c),
                      if (complaint.customerPhone != null)
                        KVRow(label: 'Phone', value: complaint.customerPhone!, c: c),
                      if (complaint.assignedAsiName != null)
                        KVRow(label: 'Assigned to', value: complaint.assignedAsiName!, c: c),
                      KVRow(
                        label: 'Status',
                        value: _statusLabel(complaint.status),
                        c: c,
                        last: complaint.resolutionNote == null,
                      ),
                      if (complaint.resolutionNote != null)
                        KVRow(
                          label: 'Resolution',
                          value: complaint.resolutionNote!,
                          c: c,
                          valueColor: isResolved ? c.greenText : null,
                          last: true,
                        ),
                    ],
                  ),
                ),

                // ── Units ──────────────────────────────────────
                if (complaint.lines.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text('Units', style: AppTextStyles.sectionTitle(color: c.text)),
                  const SizedBox(height: 10),
                  ...complaint.lines.map((line) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AppCard(
                      c: c,
                      child: Column(
                        children: [
                          if (line.serialNumber != null)
                            KVRow(label: 'Serial no.', value: line.serialNumber!, c: c,
                                last: line.notes == null),
                          if (line.notes != null)
                            KVRow(label: 'Notes', value: line.notes!, c: c, last: true),
                          if (line.serialNumber == null && line.notes == null)
                            KVRow(label: 'Unit', value: '—', c: c, last: true),
                        ],
                      ),
                    ),
                  )),
                ],
              ]),
            ),
          ),
        ],
      ),
    );
  }

  String _statusLabel(String s) {
    const labels = {
      'raised': 'Raised — awaiting assignment',
      'assigned': 'Assigned to service engineer',
      'visit': 'Field visit scheduled',
      'test_result_submitted': 'Test result submitted',
      'retest_requested': 'Retest requested',
      'resolved': 'Resolved',
      'telephonic_closure': 'Closed (telephonic)',
      'cancelled': 'Cancelled',
    };
    return labels[s] ?? s;
  }
}

class _Loading extends StatelessWidget {
  final AppThemeColors c;
  const _Loading({required this.c});

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.all(18),
        children: List.generate(
          4,
          (_) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Container(height: 52, decoration: BoxDecoration(color: c.sunken, borderRadius: BorderRadius.circular(16))),
          ),
        ),
      );
}
