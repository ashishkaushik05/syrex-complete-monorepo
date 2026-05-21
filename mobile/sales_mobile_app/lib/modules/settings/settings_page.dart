import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session_controller.dart';
import '../../core/network/api_client.dart';
import '../../shared/widgets/premium_surfaces.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('App Settings'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: AppPalette.ink,
      ),
      body: PremiumGradientBackground(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'API & Environment',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 14),
                  _SettingsRow(
                    icon: Icons.cloud_outlined,
                    label: 'API Base URL',
                    value: config.baseUrl,
                    copyable: true,
                  ),
                  const SizedBox(height: 10),
                  _SettingsRow(
                    icon: Icons.layers_outlined,
                    label: 'Environment',
                    value: config.env.name.toUpperCase(),
                  ),
                ],
              ),
            ),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Location',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 14),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.location_on_outlined,
                        color: AppPalette.ocean),
                    title: const Text('Location Permissions',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Open system settings to manage permissions'),
                    trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                    onTap: () {
                      // Platform channel or url_launcher can open app settings.
                      // Showing a snackbar as placeholder until url_launcher is added.
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                              'Open System Settings > Apps > Syrex Sales > Permissions'),
                          duration: Duration(seconds: 4),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Session',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 10),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.refresh_rounded,
                        color: AppPalette.ocean),
                    title: const Text('Refresh Session',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Re-fetch your profile and permissions'),
                    onTap: () async {
                      await ref
                          .read(sessionControllerProvider.notifier)
                          .refreshSession();
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Session refreshed.')),
                        );
                      }
                    },
                  ),
                ],
              ),
            ),
            const PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Notifications',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  SizedBox(height: 10),
                  Text(
                    'Push notification preferences will be available in a future update.',
                    style: TextStyle(color: Color(0xFF6A7B88), fontSize: 13, height: 1.5),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.label,
    required this.value,
    this.copyable = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppPalette.ocean),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 12, color: Color(0xFF6A7B88))),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ),
        if (copyable)
          IconButton(
            icon: const Icon(Icons.copy_rounded, size: 16),
            color: AppPalette.ocean,
            tooltip: 'Copy',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text('Copied to clipboard'),
                    duration: Duration(seconds: 2)),
              );
            },
          ),
      ],
    );
  }
}
