import 'package:flutter_test/flutter_test.dart';
import 'package:sales_mobile_app/modules/field/screens/field_home_page.dart';

void main() {
  test('local active shift selects the end-shift path', () {
    expect(
      shouldEndFieldShift(
        serverShift: null,
        hasLocalActiveShift: true,
      ),
      isTrue,
    );
  });

  test('no local or server shift selects the start-shift path', () {
    expect(
      shouldEndFieldShift(
        serverShift: null,
        hasLocalActiveShift: false,
      ),
      isFalse,
    );
  });
}
