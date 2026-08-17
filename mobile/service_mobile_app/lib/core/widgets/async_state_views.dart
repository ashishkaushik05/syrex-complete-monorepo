import 'package:flutter/material.dart';

import '../errors/app_error.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label = 'Loading...'});
  final String label;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 12),
            Text(label),
          ],
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(message, textAlign: TextAlign.center),
        ),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});
  final AppError error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final title = switch (error.type) {
      AppErrorType.offline => 'You are offline',
      AppErrorType.forbidden => 'Action not allowed',
      AppErrorType.notFound => 'Complaint unavailable',
      AppErrorType.conflict => 'Complaint changed',
      AppErrorType.upload => 'Upload failed',
      _ => 'Could not load data',
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(error.message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
