# Field Sense — Flutter Client Implementation Plan

## Context

Field Sense is a GPS-based field agent tracking module baked into the Sales app
(`mobile/outlet_owner_template`). It is only visible when `auth.me` returns
`isFieldEnabled: true` for an `internal` user.

The backend is implemented as tRPC procedures (`fieldShifts.*`, `fieldLocation.*`,
`fieldVisits.*`, `fieldAttendance.*`, `fieldSchedule.*`) plus a raw SSE endpoint
(`GET /field/live-stream`).

---

## Stack (same as existing app)

| Layer        | Choice                             |
|--------------|------------------------------------|
| State        | `flutter_riverpod`                 |
| Routing      | `go_router` (existing `appRouterProvider`) |
| HTTP         | `dio` (existing `dioProvider`)     |
| Secure store | `flutter_secure_storage`           |
| GPS          | `geolocator`                       |
| Background   | `flutter_background_service`       |
| Audio        | `record` (recording) + `audioplayers` (playback preview) |
| Models       | `freezed` + `json_serializable`    |

---

## New Dependencies to Add (pubspec.yaml)

```yaml
geolocator: ^13.0.0
flutter_background_service: ^5.0.6
record: ^5.2.0
audioplayers: ^6.1.0
freezed_annotation: ^2.4.4
json_annotation: ^4.9.0

dev_dependencies:
  freezed: ^2.5.7
  json_serializable: ^6.8.0
  build_runner: ^2.4.13
```

---

## Folder Structure

```
lib/
  core/
    location/
      background_location_service.dart   ← background GPS + flush loop
  modules/
    field/
      models/
        shift.dart                        ← Shift, ShiftStatus, ShiftStartType, ShiftEndType
        field_visit.dart                  ← FieldVisit
        attendance.dart                   ← DailyAttendance, AttendanceStatus
        shift_schedule.dart               ← ShiftSchedule
      repository/
        field_repository.dart             ← all tRPC calls via dioProvider
      providers/
        shift_providers.dart              ← activeShiftProvider, shiftListProvider
        location_providers.dart           ← isTrackingProvider
        visit_providers.dart              ← visitsForShiftProvider
        attendance_providers.dart         ← todayAttendanceProvider, attendanceHistoryProvider
        schedule_providers.dart           ← myScheduleProvider
      shift/
        shift_screen.dart                 ← main field home: status + controls
      visits/
        log_visit_screen.dart             ← capture GPS + note + audio, submit
      attendance/
        attendance_screen.dart            ← self-mark + history list
      schedule/
        schedule_view.dart                ← read-only display of server schedule
```

---

## Phase FS4: GPS Background Service + Shift Screen

### FS4.1 — `lib/core/location/background_location_service.dart`

**Responsibilities:**
- `flutter_background_service` foreground service (Android notification channel)
- Starts GPS stream at `LocationAccuracy.bestForNavigation`, `distanceFilter: 10`
- Accumulates `{lat, lng, accuracy, recordedAt}` points in memory
- Every **10 seconds**: POST batch to `fieldLocation.ingest` via a dedicated `Dio`
  instance (reads access token from `flutter_secure_storage` — same keys as
  `TokenStore`)
- On 401 response from ingest: stops the service (token expired)
- Listens for `syncAuth` message from main isolate to refresh the in-memory token

**Key API:**
```dart
class BackgroundLocationService {
  static Future<void> start();
  static Future<void> stop();
  static Future<bool> isRunning();
  static Future<void> syncAuth(String accessToken);
}
```

**Android manifest additions required:**
- `FOREGROUND_SERVICE`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`
  permissions
- Foreground service declaration with `foregroundServiceType="location"`

### FS4.2 — `lib/modules/field/models/shift.dart`

```dart
@freezed
class Shift with _$Shift {
  const factory Shift({
    required String id,
    required String agentId,
    required String orgId,
    required DateTime startedAt,
    DateTime? endedAt,
    required String startType,   // 'auto' | 'manual'
    String? endType,             // 'auto' | 'manual' | 'extended'
    required String status,      // 'active' | 'completed'
  }) = _Shift;

  factory Shift.fromJson(Map<String, dynamic> json) => _$ShiftFromJson(json);
}
```

### FS4.3 — `lib/modules/field/repository/field_repository.dart`

All tRPC calls follow the existing pattern: `dio.post('/fieldShifts.start', ...)`,
`dio.get('/fieldShifts.active', ...)` etc.

```dart
class FieldRepository {
  FieldRepository({required this.dio});
  final Dio dio;

  Future<Shift?> getActiveShift();
  Future<Shift> startShift({String? orgId});
  Future<Shift> endShift();
  Future<Shift> extendShift();
  Future<List<Shift>> listShifts({String? date, String? status});

  Future<int> ingestLocations(List<LocationPoint> points);
  Future<TrailResult> getShiftTrail(String shiftId);

  Future<FieldVisit> logVisit({required double lat, required double lng, String? description, String? audioUrl});
  Future<List<FieldVisit>> getVisitsForShift(String shiftId);

  Future<DailyAttendance> markAttendance({required String status, String? note});
  Future<List<DailyAttendance>> listAttendance({String? from, String? to});

  Future<ShiftSchedule?> getMySchedule();
}
```

### FS4.4 — `lib/modules/field/providers/shift_providers.dart`

```dart
// Active shift — refreshed on app resume + after start/end/extend
final activeShiftProvider = FutureProvider<Shift?>((ref) async {
  return ref.read(fieldRepositoryProvider).getActiveShift();
});

// isTracking reflects BackgroundLocationService.isRunning()
final isTrackingProvider = StreamProvider<bool>((ref) {
  return Stream.periodic(const Duration(seconds: 5))
      .asyncMap((_) => BackgroundLocationService.isRunning());
});
```

### FS4.5 — `lib/modules/field/shift/shift_screen.dart`

**UI elements:**
- **Header card**: current date + agent name
- **Status card**: "No Active Shift" or shift start time + duration timer
  (live ticker using `StreamBuilder` on 1-second stream)
- **GPS badge**: green dot "Tracking" / red dot "Stopped" (from `isTrackingProvider`)
- **Primary action button**:
  - `Start Shift` when no active shift
  - `End Shift` when active
- **Extend button**: visible after 18:30 local time when active and `endType != 'extended'`
- **Log Visit FAB**: only when active shift exists → navigates to `/field/visit/log`
- **Attendance quick-mark**: small button to mark self as `present` / `absent`
- **Schedule info**: "Auto-start: HH:MM (IST)" pulled from `myScheduleProvider`

**Lifecycle:**
- On `AppLifecycleState.resumed`: re-read `activeShiftProvider`
- If active shift exists and `isTracking == false`: call `BackgroundLocationService.start()` + sync auth

---

## Phase FS5: Visits + Attendance Screens

### FS5.1 — `lib/modules/field/visits/log_visit_screen.dart`

**Flow:**
1. On screen open: `Geolocator.getCurrentPosition()` to capture `lat/lng` (shown
   as "GPS acquired" or loading spinner)
2. Text field: description (optional)
3. Audio section:
   - "Record" button: uses `record` package → saves to temp file
   - "Stop" button when recording
   - `audioplayers` for preview playback before submit
   - If audio recorded: presign upload via `attachments.requestPresign` tRPC call →
     PUT raw bytes to `uploadUrl` → store `publicUrl` as `audioUrl`
4. "Log Visit" submit button → calls `fieldVisits.log`
5. On success: `ref.invalidate(visitsForShiftProvider(...))`, pop screen

**Audio presign flow** (reuses existing attachment infrastructure):
```dart
// 1. Get presign URL
final presign = await dio.post('/attachments.requestPresign', data: {
  'json': { 'entityType': 'field_visit', 'entityId': shiftId, 'fileName': 'visit-audio.m4a', 'mimeType': 'audio/m4a' }
});
// 2. PUT file bytes
final bytes = await File(tempPath).readAsBytes();
await Dio().put(presign.uploadUrl, data: bytes, options: Options(headers: {'Content-Type': 'audio/m4a'}));
// 3. Store publicUrl
audioUrl = presign.publicUrl;
```

### FS5.2 — `lib/modules/field/attendance/attendance_screen.dart`

**Layout:**
- Top row: today's status chip (`present` / `absent` / `half_day` / `leave`)
  + self-mark dropdown if no record yet, or edit button
- List below: past 30 days attendance records (date + status chip)
- Each record row shows: `YYYY-MM-DD`, status badge (color-coded), note if any

**Status colors:**
| Status    | Color       |
|-----------|-------------|
| present   | `#16a34a` green |
| half_day  | `#ca8a04` amber |
| absent    | `#dc2626` red |
| leave     | `#6366f1` indigo |

---

## Router Wiring

Add to `app_router.dart`:

```dart
// Field Sense routes — only navigable if session.user.isFieldEnabled
GoRoute(
  path: '/field',
  builder: (_, __) => const ShiftScreen(),
),
GoRoute(
  path: '/field/visit/log',
  builder: (_, __) => const LogVisitScreen(),
),
GoRoute(
  path: '/field/attendance',
  builder: (_, __) => const AttendanceScreen(),
),
```

Field Sense tab in the bottom navigation (or side drawer) of `DashboardPage`
— visible only when `session.user?.isFieldEnabled == true`.

---

## auth.me Contract Change Required

The backend `auth.me` procedure must return `isFieldEnabled` for the mobile client
to know whether to show Field Sense. Add to `auth.ts`:

```typescript
// In the me query output and select:
isFieldEnabled: z.boolean()
// select: { isFieldEnabled: true, ... }
```

And in `AuthUser` model (`auth_models.dart`):

```dart
class AuthUser {
  // ... existing fields ...
  final bool isFieldEnabled;
}
```

---

## Background Service Android Setup

In `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<service
  android:name="id.flutter.flutter_background_service.BackgroundService"
  android:foregroundServiceType="location"
  android:exported="false" />
```

---

## tRPC Call Patterns (existing `dioProvider` conventions)

All field tRPC calls follow the existing pattern from `outlet_portal_client.dart`:

**Query (GET):**
```dart
final res = await dio.get('/fieldShifts.active',
  queryParameters: {'input': jsonEncode({'json': {}})});
```

**Mutation (POST):**
```dart
final res = await dio.post('/fieldShifts.start',
  data: jsonEncode({'json': {'orgId': orgId}}),
  options: Options(headers: {'Content-Type': 'application/json'}));
```

Response unwrap (same `_extractResult` helper from `auth_repository.dart`):
```dart
Map<String, dynamic> _extractResult(dynamic raw) {
  if (raw is List && raw.isNotEmpty) {
    final first = raw.first;
    if (first is Map<String, dynamic>) {
      return (first['result']?['data']?['json'] ?? {}) as Map<String, dynamic>;
    }
  }
  if (raw is Map<String, dynamic>) {
    return (raw['result']?['data']?['json'] ?? {}) as Map<String, dynamic>;
  }
  return {};
}
```

---

## Implementation Order

1. **Add dependencies** to `pubspec.yaml`
2. **Add `isFieldEnabled` to `AuthUser`** + `auth_repository.dart` me() parse
3. **`lib/core/location/background_location_service.dart`** — background GPS service
4. **Models** — `shift.dart`, `field_visit.dart`, `attendance.dart`, `shift_schedule.dart`
5. **`field_repository.dart`** — all tRPC calls
6. **Providers** — `shift_providers.dart`, `location_providers.dart`, `visit_providers.dart`, `attendance_providers.dart`
7. **`shift_screen.dart`** — main field home with start/end/extend + GPS badge
8. **`log_visit_screen.dart`** — GPS capture + note + audio + submit
9. **`attendance_screen.dart`** — self-mark + 30-day history
10. **Router + nav wiring** — add routes + conditional Field tab in dashboard
11. **Android manifest** — permissions + service declaration
12. **`schedule_view.dart`** — read-only schedule display (inside shift screen or separate tab)

---

## Auth.me Backend Change Needed

Before mobile implementation, update `backend/src/trpc/routes/auth.ts`:
- Add `isFieldEnabled: z.boolean()` to the output schema of `me`
- Add `isFieldEnabled: true` to the user select in the `me` query

This is the gate that makes the Field tab appear in the app.

---

## Invariants

- `BackgroundLocationService` only runs while a shift is active. The shift screen
  checks `isTracking` on every resume and auto-starts tracking if a shift exists.
- `LogVisitScreen` is only accessible via the shift screen FAB (which is only
  shown when an active shift exists) — so the server-side "no active shift" guard
  is a safety net, not the primary gate.
- Attendance marks are idempotent — upsert on server means tapping "present" twice
  is safe.
- Token sync: `syncAuth` must be called from main isolate after every token refresh
  so the background isolate's flush loop has the latest token.
