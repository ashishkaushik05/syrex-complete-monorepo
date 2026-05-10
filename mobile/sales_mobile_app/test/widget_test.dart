import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:sales_mobile_app/app/bootstrap/app_bootstrap.dart';

void main() {
  testWidgets('app bootstraps', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: SalesMobileApp()));
    expect(find.byType(SalesMobileApp), findsOneWidget);
  });
}
