import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:service_mobile_app/core/network/api_client.dart';

void main() {
  test('extractTrpcResult decodes object and batch envelopes', () {
    final object = {
      'result': {
        'data': {
          'json': {'items': [1, 2]}
        }
      }
    };
    expect(extractTrpcResult(object), {
      'items': [1, 2]
    });
    expect(extractTrpcResult([object]), {
      'items': [1, 2]
    });
  });

  test('refresh mutex runs one rotation for concurrent callers', () async {
    final mutex = TokenRefreshMutex();
    final gate = Completer<void>();
    var rotations = 0;

    Future<void> rotate() async {
      rotations++;
      await gate.future;
    }

    final first = mutex.run(rotate);
    final second = mutex.run(rotate);
    await Future<void>.delayed(Duration.zero);
    expect(rotations, 1);
    gate.complete();
    await Future.wait([first, second]);
    expect(rotations, 1);
  });
}
