# Sales Mobile (Flutter Template)

Sales Mobile v1 for field sales reps.

## v1 Capabilities
- Password login with `Remember Me` session persistence.
- Catalog browse/search/filter.
- Create order using read-only API pricing (quantity editable only).
- Order history and order detail with fulfillment tracking.
- Read-only invoice history/detail.
- Read-only dispatch history/detail.

## Runtime Notes
- Android + iOS are first-class targets.
- App is online-first.
- Catalog supports cached read fallback when network fails.
- Order submission remains online-only.

## Setup
1. Install Flutter stable (Dart 3.4+).
2. `cd mobile/outlet_owner_template`
3. `flutter pub get`
4. Provide base URL using dart define:
   - `flutter run --dart-define=APP_ENV=dev --dart-define=API_BASE_URL=https://<host>/trpc`

## Quality Checks
- `flutter analyze`
- `flutter test`

## Core Architecture Rules
- One auth/session path in `lib/core/auth`.
- One API client path in `lib/core/network`.
- One shared query/cache path in `lib/core/query` + module providers.
- No module-local alternate HTTP/auth implementations.
