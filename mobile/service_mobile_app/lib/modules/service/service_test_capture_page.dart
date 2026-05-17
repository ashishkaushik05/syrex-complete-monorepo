import 'package:flutter/material.dart';

class ServiceTestCapturePage extends StatelessWidget {
  const ServiceTestCapturePage({super.key, required this.complaintId});

  final String complaintId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Test Capture $complaintId')),
      body: const Padding(
        padding: EdgeInsets.all(16),
        child: Text(
          'Visit/test capture scaffolded. Wire attachment upload + offline retry to serviceTests.submit and attachments.createPending/confirm.',
        ),
      ),
    );
  }
}
