enum AppEnv { dev, staging, prod }

class AppConfig {
  const AppConfig({required this.env, required this.baseUrl});

  final AppEnv env;
  final String baseUrl;

  static AppConfig fromDartDefine() {
    const envRaw = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    const baseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://strideit.syrexbatteries.in/trpc',
    );

    switch (envRaw) {
      case 'prod':
        return const AppConfig(env: AppEnv.prod, baseUrl: baseUrl);
      case 'staging':
        return const AppConfig(env: AppEnv.staging, baseUrl: baseUrl);
      default:
        return const AppConfig(env: AppEnv.dev, baseUrl: baseUrl);
    }
  }
}
