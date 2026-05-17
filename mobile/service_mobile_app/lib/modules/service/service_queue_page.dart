import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ServiceQueuePage extends StatelessWidget {
  const ServiceQueuePage({super.key});

  @override
  Widget build(BuildContext context) {
    final cards = const [
      ('Raised', '/service/raised'),
      ('Visit', '/service/visit'),
      ('Test Submitted', '/service/test-submitted'),
      ('Retest', '/service/retest'),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Service Queue')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: cards.length,
        itemBuilder: (_, index) {
          final card = cards[index];
          return Card(
            child: ListTile(
              title: Text(card.$1),
              subtitle: const Text('Stage queue view scaffolded for API integration'),
              onTap: () => context.push('/service/complaint/demo'),
            ),
          );
        },
      ),
    );
  }
}
