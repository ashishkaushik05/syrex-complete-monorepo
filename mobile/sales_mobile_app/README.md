# Sales Mobile App

Standalone Flutter Sales application project.

## Features
- Auth/session flow with backend `auth.login`, `auth.me`, `auth.refresh`, `auth.logout`
- Sales dashboard
- Catalog browse/search/filter
- Order creation, order history, order details
- Invoice history/details (read-only)
- Dispatch history/details (read-only)

## Run
```bash
cd mobile/sales_mobile_app
flutter pub get
flutter run --dart-define=APP_ENV=dev --dart-define=API_BASE_URL=https://<host>/trpc
```

## Quality checks
```bash
flutter analyze
flutter test
```
