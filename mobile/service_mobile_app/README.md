# Syrex Service Mobile

Online-only Flutter field app for ASI and Service Engineer staff.

## Run

```bash
flutter run --dart-define=API_BASE_URL=https://host.example/trpc
```

`API_BASE_URL` is mandatory. Authentication uses rotating staff JWT sessions in
secure storage. The app does not persist offline mutation drafts.

## Android Release Signing

Set `SERVICE_SIGNING_PROPERTIES` to a properties file containing:

```properties
storeFile=/absolute/path/to/release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Then build with:

```bash
flutter build apk --release \
  --dart-define=API_BASE_URL=https://host.example/trpc
```

iOS source and camera/photo-library configuration are included. iOS compilation
is deferred to the macOS release follow-up.
