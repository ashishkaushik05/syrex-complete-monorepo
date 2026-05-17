class AppConfig {
  const AppConfig({required this.baseUrl});

  final String baseUrl;

  factory AppConfig.fromDartDefine() {
    const raw = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000/trpc');
    return AppConfig(baseUrl: raw);
  }
}
