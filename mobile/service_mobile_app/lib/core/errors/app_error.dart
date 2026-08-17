import 'package:dio/dio.dart';

enum AppErrorType {
  offline,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
  upload,
  server,
}

class AppError implements Exception {
  const AppError(this.type, this.message);

  final AppErrorType type;
  final String message;

  static AppError from(Object error) {
    if (error is AppError) return error;
    if (error is DioException) {
      if (error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.receiveTimeout ||
          error.type == DioExceptionType.sendTimeout) {
        return const AppError(
          AppErrorType.offline,
          'No connection. Reconnect and retry.',
        );
      }
      final status = error.response?.statusCode;
      final data = error.response?.data;
      final message = _message(data) ?? 'The server could not complete the request.';
      if (status == 401) return AppError(AppErrorType.unauthorized, message);
      if (status == 403) return AppError(AppErrorType.forbidden, message);
      if (status == 404) return AppError(AppErrorType.notFound, message);
      if (status == 409) return AppError(AppErrorType.conflict, message);
      if (status == 400) return AppError(AppErrorType.validation, message);
      return AppError(AppErrorType.server, message);
    }
    return AppError(AppErrorType.server, error.toString());
  }

  static String? _message(dynamic raw) {
    if (raw is Map<String, dynamic>) {
      final error = raw['error'];
      if (error is Map<String, dynamic>) {
        return error['message']?.toString();
      }
      return raw['message']?.toString();
    }
    if (raw is List && raw.isNotEmpty) return _message(raw.first);
    return null;
  }

  @override
  String toString() => message;
}
