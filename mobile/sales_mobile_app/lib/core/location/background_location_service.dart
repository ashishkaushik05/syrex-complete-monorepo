import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';

import '../config/app_env.dart';

const _kStop = 'stopService';

class BackgroundLocationService {
  static final _service = FlutterBackgroundService();

  static Future<void> configure() async {
    await _service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _onStart,
        isForegroundMode: true,
        notificationChannelId: 'syrex_field_location',
        initialNotificationTitle: 'Field Sense',
        initialNotificationContent: 'Tracking your location…',
        foregroundServiceNotificationId: 8801,
        foregroundServiceTypes: [AndroidForegroundType.location],
        autoStart: false,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: _onStart,
        onBackground: _onIosBackground,
      ),
    );
  }

  static Future<bool> get isRunning => _service.isRunning();

  static Future<void> start() async {
    if (!await _service.isRunning()) await _service.startService();
  }

  static Future<void> stop() async {
    _service.invoke(_kStop);
  }
}

@pragma('vm:entry-point')
Future<bool> _onIosBackground(ServiceInstance service) async => true;

@pragma('vm:entry-point')
void _onStart(ServiceInstance service) async {
  final baseUrl = AppConfig.fromDartDefine().baseUrl;
  const storage = FlutterSecureStorage();

  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: const {'ngrok-skip-browser-warning': '1'},
    ),
  );

  service.on(_kStop).listen((_) async => service.stopSelf());

  // Check location permission before starting the GPS stream.
  final permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    await service.stopSelf();
    return;
  }

  final buffer = <Map<String, dynamic>>[];

  Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10, // metres between updates
    ),
  ).listen((pos) {
    buffer.add({
      'lat': pos.latitude,
      'lng': pos.longitude,
      'accuracy': pos.accuracy,
      'recordedAt': pos.timestamp.toUtc().toIso8601String(),
    });
  });

  // Flush every 10 seconds. Reads the token fresh each time so token
  // refreshes in the main isolate are picked up automatically.
  int consecutiveBadShift = 0;
  Timer.periodic(const Duration(seconds: 10), (_) async {
    if (buffer.isEmpty) return;

    final token = await storage.read(key: 'access_token') ?? '';
    if (token.isEmpty) return;
    dio.options.headers['Authorization'] = 'Bearer $token';

    const maxBatch = 500;
    while (buffer.isNotEmpty) {
      final end = buffer.length < maxBatch ? buffer.length : maxBatch;
      final batch = List<Map<String, dynamic>>.from(buffer.sublist(0, end));
      buffer.removeRange(0, end);

      try {
        await dio.post(
          '/fieldLocation.ingest',
          data: jsonEncode({'json': {'locations': batch}}),
          options: Options(headers: {'Content-Type': 'application/json'}),
        );
        consecutiveBadShift = 0;
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) {
          // Token permanently invalid — stop silently.
          await service.stopSelf();
          return;
        }
        if (e.response?.statusCode == 400) {
          // No active shift on the server. Stop after 3 consecutive
          // 400s to avoid halting on a transient server error.
          consecutiveBadShift++;
          if (consecutiveBadShift >= 3) {
            await service.stopSelf();
            return;
          }
        }
        // Network error or 5xx: drop batch, keep running.
      } catch (_) {
        // keep running
      }
    }
  });
}
