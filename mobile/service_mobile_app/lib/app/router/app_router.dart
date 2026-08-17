import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../modules/auth/login_page.dart';
import '../../modules/service/service_detail_page.dart';
import '../../modules/service/service_queue_page.dart';
import '../../modules/service/service_test_capture_page.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(sessionControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final path = state.fullPath ?? '/';
      final isLogin = path == '/login';

      if (session.status == SessionStatus.unknown) {
        return path == '/splash' ? null : '/splash';
      }

      if ((session.status == SessionStatus.unauthenticated ||
              session.status == SessionStatus.expired ||
              session.status == SessionStatus.error) &&
          !isLogin) {
        return '/login';
      }

      if (session.status == SessionStatus.authenticated &&
          (isLogin || path == '/splash')) {
        return '/service/queue';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (_, __) => const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
      ),
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(
          path: '/service/queue', builder: (_, __) => const ServiceQueuePage()),
      GoRoute(
        path: '/service/complaint/:complaintId',
        builder: (_, state) {
          final complaintId = state.pathParameters['complaintId']!;
          return ServiceDetailPage(complaintId: complaintId);
        },
      ),
      GoRoute(
        path: '/service/complaint/:complaintId/diagnostic',
        builder: (_, state) {
          final complaintId = state.pathParameters['complaintId']!;
          return ServiceTestCapturePage(complaintId: complaintId);
        },
      ),
    ],
  );
});
