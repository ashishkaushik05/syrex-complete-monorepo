class AppConfig {
  const AppConfig({required this.baseUrl});

  final String baseUrl;

  factory AppConfig.fromDartDefine() {
    const raw = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://strideit.syrexbatteries.in/trpc');
    return AppConfig(baseUrl: raw);
  }
}
