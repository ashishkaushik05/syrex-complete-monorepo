import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ServiceDetailPage extends StatelessWidget {
  const ServiceDetailPage({super.key, required this.complaintId});

  final String complaintId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Complaint $complaintId')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Detail workspace scaffolded:'),
            const SizedBox(height: 8),
            const Text('- serial insight cards'),
            const Text('- assignment actions'),
            const Text('- telephonic closure + retest feedback'),
            const Text('- role-based decision controls'),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => context.push('/service/complaint/$complaintId/test'),
              child: const Text('Open Test Capture'),
            ),
          ],
        ),
      ),
    );
  }
}
