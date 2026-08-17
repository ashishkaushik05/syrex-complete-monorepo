import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:sales_mobile_app/app/bootstrap/app_bootstrap.dart';
import 'package:sales_mobile_app/core/storage/token_store.dart';

/// In-memory [TokenStore] so session bootstrap resolves synchronously.
///
/// The real provider wraps [FlutterSecureStorage], whose platform channel is
/// absent under `flutter test`, so `tokenStore.read()` never completes and the
/// 3s read-timeout Timer in [SessionController]._bootstrap stays pending past
/// teardown — failing the test with "A Timer is still pending". Returning null
/// here makes bootstrap settle to `unauthenticated` and cancels that timer.
class _FakeTokenStore implements TokenStore {
  @override
  Future<TokenPair?> read() async => null;

  @override
  Future<void> write(TokenPair tokens) async {}

  @override
  Future<void> clear() async {}
}

void main() {
  testWidgets('app bootstraps when unauthenticated', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenStoreProvider.overrideWithValue(_FakeTokenStore()),
        ],
        child: const SalesMobileApp(),
      ),
    );
    // Let the fire-and-forget _bootstrap() future settle to unauthenticated.
    await tester.pump();

    expect(find.byType(SalesMobileApp), findsOneWidget);
  });
}
