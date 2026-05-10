import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:outlet_owner_template/app/bootstrap/app_bootstrap.dart';

void main() {
  testWidgets('app bootstraps', (WidgetTester tester) async {
    await tester
        .pumpWidget(const ProviderScope(child: OutletOwnerTemplateApp()));
    expect(find.byType(OutletOwnerTemplateApp), findsOneWidget);
  });
}
