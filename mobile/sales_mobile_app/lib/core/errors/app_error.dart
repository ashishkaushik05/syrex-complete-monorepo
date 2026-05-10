enum AppErrorType {
  unauthorized,
  forbidden,
  validation,
  conflict,
  server,
  network,
  unknown,
}

class AppError implements Exception {
  const AppError({required this.type, required this.message, this.requestId});

  final AppErrorType type;
  final String message;
  final String? requestId;
}
