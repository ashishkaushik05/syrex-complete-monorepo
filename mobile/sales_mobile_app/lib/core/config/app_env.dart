enum AppEnv { dev, staging, prod }

class AppConfig {
  const AppConfig({required this.env, required this.baseUrl, required this.orgId});

  final AppEnv env;
  final String baseUrl; 
  final String? orgId;

  static AppConfig fromDartDefine() {
    const envRaw = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    const baseUrlRaw = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://overprecise-nestor-raspingly.ngrok-free.dev/trpc');
    const orgIdRaw = String.fromEnvironment('APP_ORG_ID', defaultValue: '');
    final orgId = orgIdRaw.trim().isEmpty ? null : orgIdRaw.trim();
    final baseUrl = _normalizeBaseUrl(baseUrlRaw);

    switch (envRaw.trim()) {  
      case 'prod':
        return AppConfig(env: AppEnv.prod, baseUrl: baseUrl, orgId: orgId);
      case 'staging':
        return AppConfig(env: AppEnv.staging, baseUrl: baseUrl, orgId: orgId);
      default:
        return AppConfig(env: AppEnv.dev, baseUrl: baseUrl, orgId: orgId);
    }
  }

  static String _normalizeBaseUrl(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) {
      throw StateError(
        'API_BASE_URL is not set. '
        'Pass --dart-define=API_BASE_URL=<your-api-url> when running or building.',
      );
    }
    if (Uri.tryParse(trimmed)?.hasScheme == true) return trimmed;
    throw StateError(
      'API_BASE_URL "$trimmed" is not a valid URL with a scheme. '
      'Pass --dart-define=API_BASE_URL=<your-api-url> when running or building.',
    );
  }
}
