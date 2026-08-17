class AppConfig {
  const AppConfig({required this.baseUrl});

  final String baseUrl;

  factory AppConfig.fromDartDefine() {
    const raw = String.fromEnvironment('API_BASE_URL');
    final value = raw.trim();
    final uri = Uri.tryParse(value);
    if (value.isEmpty ||
        uri == null ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        (uri.scheme != 'http' && uri.scheme != 'https')) {
      throw StateError(
        'API_BASE_URL is required. Pass '
        '--dart-define=API_BASE_URL=https://host.example/trpc',
      );
    }
    return AppConfig(baseUrl: value.replaceFirst(RegExp(r'/$'), ''));
  }
}
