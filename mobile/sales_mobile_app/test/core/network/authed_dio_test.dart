import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sales_mobile_app/core/config/app_env.dart';
import 'package:sales_mobile_app/core/network/authed_dio.dart';
import 'package:sales_mobile_app/core/storage/token_store.dart';

void main() {
  test('configured organization is propagated to authenticated requests', () {
    final dio = buildAuthedDio(
      config: const AppConfig(
        env: AppEnv.prod,
        baseUrl: 'https://example.test/trpc',
        orgId: 'syrex-global',
      ),
      tokenStore: TokenStore(const FlutterSecureStorage()),
    );

    expect(dio.options.headers['x-org-id'], 'syrex-global');
  });

  test('organization header is omitted when no organization is configured', () {
    final dio = buildAuthedDio(
      config: const AppConfig(
        env: AppEnv.prod,
        baseUrl: 'https://example.test/trpc',
        orgId: null,
      ),
      tokenStore: TokenStore(const FlutterSecureStorage()),
    );

    expect(dio.options.headers, isNot(contains('x-org-id')));
  });
}
