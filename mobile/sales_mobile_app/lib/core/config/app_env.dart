enum AppEnv { dev, staging, prod }

class AppConfig {
  const AppConfig({required this.env, required this.baseUrl, required this.orgId});

  final AppEnv env;
  final String baseUrl;
  final String? orgId;

  static AppConfig fromDartDefine() {
    const envRaw = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    const baseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://overprecise-nestor-raspingly.ngrok-free.dev/trpc',
    );
    const orgIdRaw = String.fromEnvironment('APP_ORG_ID', defaultValue: '');
    final orgId = orgIdRaw.trim().isEmpty ? null : orgIdRaw.trim();

    switch (envRaw) {
      case 'prod':
        return AppConfig(env: AppEnv.prod, baseUrl: baseUrl, orgId: orgId);
      case 'staging':
        return AppConfig(env: AppEnv.staging, baseUrl: baseUrl, orgId: orgId);
      default:
        return AppConfig(env: AppEnv.dev, baseUrl: baseUrl, orgId: orgId);
    }
  }
}
