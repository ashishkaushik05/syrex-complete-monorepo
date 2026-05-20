# Sales Mobile App Field Sense Agent Plan

## Purpose

This is the handoff plan for the mobile handling agent. The mobile agent will make the Sales Mobile App lossless and offline-capable once backend V2 contracts are available.

Backend changes are owned separately by Codex. Mobile should not invent a parallel backend contract; build against the V2 endpoints in the backend report.

## Mobile Agent Mission

Replace the current prototype tracking behavior with a production-grade offline-first Field Sense client.

The mobile app must be able to:

- Start a shift offline.
- Capture location in foreground/background.
- Persist every point before upload.
- Survive process death and app restart.
- Retry failed sync without duplicates.
- End a shift offline.
- Sync all pending data when network/auth returns.
- Report tracking/sync health.

## Current Mobile Problems To Fix

- `BackgroundLocationService` uses an in-memory list for location points.
- Failed batches are removed before upload and then dropped on error.
- Shift start requires online server success.
- Shift end requires online server success.
- Background service stops on 401 instead of preserving queue and recovering auth.
- Permissions are requested during app bootstrap instead of shift-start context.
- iOS `Info.plist` lacks background location keys.
- Visits/stops are online-only.
- Audio visit capture is placeholder URL input, not managed recording/upload.

## Required Local Data Model

Use SQLite/Drift/sqflite or another durable local database. Recommended tables:

### `local_field_shifts`

- `clientShiftId` text primary key
- `serverShiftId` text nullable
- `status` text: `local_active`, `syncing_start`, `server_active`, `ending_pending`, `completed`, `conflict`
- `startedAt` text ISO
- `endedAt` text nullable ISO
- `startSyncedAt` text nullable
- `endSyncedAt` text nullable
- `lastErrorCode` text nullable
- `createdAt` text ISO
- `updatedAt` text ISO

### `local_location_points`

- `clientPointId` text primary key
- `clientShiftId` text indexed
- `serverShiftId` text nullable
- `lat` real
- `lng` real
- `accuracy` real
- `recordedAt` text ISO
- `capturedAt` text ISO
- `source` text: `foreground`, `background`, `restart_recovery`
- `altitude` real nullable
- `speed` real nullable
- `heading` real nullable
- `isMocked` boolean nullable
- `syncStatus` text: `pending`, `in_flight`, `acked`, `rejected`
- `syncAttempts` integer
- `lastErrorCode` text nullable
- `createdAt` text ISO
- `updatedAt` text ISO

### `local_field_events`

Use for visits/stops if included in this phase:

- `clientEventId` text primary key
- `clientShiftId` text
- `eventType` text: `visit`, `stop_start`, `stop_end`
- `payloadJson` text
- `syncStatus` text
- `syncAttempts` integer
- `lastErrorCode` text nullable
- `createdAt` text ISO
- `updatedAt` text ISO

## Required Mobile Services

### `FieldLocalStore`

Owns all local database reads/writes.

Responsibilities:

- Create local shifts.
- Insert location points transactionally.
- Query pending batches ordered by `recordedAt`.
- Mark points acked/duplicate/rejected.
- Store server shift ID after sync.
- Preserve all non-acked points across restarts.

### `FieldShiftController`

Owns user shift actions.

Responsibilities:

- Start shift online or offline.
- Generate `clientShiftId`.
- Ensure permissions are ready before tracking begins.
- Start location capture after local shift starts.
- End shift locally and queue end sync.

### `LocationCaptureService`

Owns GPS capture only.

Responsibilities:

- Subscribe to Geolocator stream.
- Persist every point immediately to `FieldLocalStore`.
- Never make point persistence depend on network.
- Use `clientPointId` for every point.

### `FieldSyncWorker`

Owns backend sync.

Responsibilities:

- Sync start event with `fieldShifts.syncStart`.
- Store returned `serverShiftId`.
- Upload points via `fieldLocation.ingestV2` in batches.
- Mark duplicates as acknowledged.
- Keep rejected points with reason.
- Sync shift end with `fieldShifts.syncEnd`.
- Retry retryable failures with backoff.
- Run on app start, network restore, foreground service tick, and manual retry.

### `FieldPermissionCoordinator`

Owns permission UX.

Responsibilities:

- Request foreground location first.
- Request background location only when needed and with explanation.
- Check location services enabled.
- Check battery optimization state on Android.
- Provide a health object to UI and backend.

## Backend Contract To Use

Do not use old `fieldLocation.ingest` for production tracking once V2 exists.

Expected sequence:

1. Local shift start creates `clientShiftId`.
2. Sync worker calls `fieldShifts.syncStart`.
3. Backend returns `serverShiftId`.
4. Sync worker uploads points to `fieldLocation.ingestV2` with both `clientShiftId` and `serverShiftId` when known.
5. Sync worker calls `fieldShifts.syncEnd` when local shift has ended.

## Mobile Implementation Phases

### Mobile Phase A: Local Store And Offline Shift Lifecycle

- Add local database package.
- Add shift and point tables.
- Implement local shift start/end.
- Generate stable UUIDs.
- Update UI to show local/server sync status.

Acceptance:

- User can start a shift with no network.
- A local active shift remains after app restart.

### Mobile Phase B: Durable Location Capture

- Replace in-memory buffer.
- Persist every Geolocator point.
- Keep foreground service notification active while tracking.
- Restart sync/capture safely on app resume/service start.

Acceptance:

- Captured points remain after app kill/reopen.
- No points are removed until acked.

### Mobile Phase C: Sync Worker And Backend V2 Integration

- Implement `syncStart`, `ingestV2`, `syncEnd` calls.
- Implement retry/backoff.
- Implement token refresh/re-auth preservation.
- Mark acked/duplicate/rejected records correctly.

Acceptance:

- Offline shift and points sync exactly once after reconnect.
- Duplicate upload does not create duplicate server records.

### Mobile Phase D: Permissions And Platform Hardening

- Move permission request from app bootstrap to shift-start flow.
- Add contextual permission screens.
- Add iOS plist keys and background modes.
- Validate Android foreground service notification and battery optimization flow.

Acceptance:

- App clearly blocks or warns when background tracking cannot be reliable.
- iOS and Android builds contain required location declarations.

## Mobile QA Matrix

Run on real devices where possible:

- Online start, move, end.
- Offline start, move, reconnect.
- Offline start, app kill, reopen, reconnect.
- Network drops during batch upload.
- Token expires during active shift.
- User denies foreground permission.
- User grants foreground but denies background permission.
- Android battery optimization remains enabled.
- iOS app backgrounded for extended period.
- Shift auto-closed server-side while device has pending points.

## Mobile Deliverables To Return

The mobile agent should report:

- Files changed.
- Local DB schema summary.
- Endpoint contract used.
- Manual device test results.
- Known platform limitations.
- Any backend contract changes requested.

## Mobile Definition Of Done

- No in-memory-only point queue remains in production path.
- Offline shift start/end works.
- Points survive app/process death.
- Sync is idempotent against backend V2.
- Permission flow is contextual and understandable.
- iOS/Android background config is present.
- Mobile agent documents validation results.
