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
    initialLocation: '/service/queue',
    redirect: (context, state) {
      final path = state.fullPath ?? '/';
      final isLogin = path == '/login';

      if (session.status == SessionStatus.unknown) {
        return null;
      }

      if (session.status == SessionStatus.unauthenticated && !isLogin) {
        return '/login';
      }

      if (session.status == SessionStatus.authenticated && isLogin) {
        return '/service/queue';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(path: '/service/queue', builder: (_, __) => const ServiceQueuePage()),
      GoRoute(
        path: '/service/complaint/:complaintId',
        builder: (_, state) {
          final complaintId = state.pathParameters['complaintId']!;
          return ServiceDetailPage(complaintId: complaintId);
        },
      ),
      GoRoute(
        path: '/service/complaint/:complaintId/test',
        builder: (_, state) {
          final complaintId = state.pathParameters['complaintId']!;
          return ServiceTestCapturePage(complaintId: complaintId);
        },
      ),
      GoRoute(
        path: '/service/raised',
        builder: (_, __) => const ServiceQueuePage(),
      ),
      GoRoute(
        path: '/service/visit',
        builder: (_, __) => const ServiceQueuePage(),
      ),
      GoRoute(
        path: '/service/test-submitted',
        builder: (_, __) => const ServiceQueuePage(),
      ),
      GoRoute(
        path: '/service/retest',
        builder: (_, __) => const ServiceQueuePage(),
      ),
    ],
  );
});
