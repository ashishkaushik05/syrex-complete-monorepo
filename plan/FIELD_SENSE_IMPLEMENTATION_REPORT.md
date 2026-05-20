# Field Sense And Sales Mobile Implementation Report

## Executive Summary

The repository contains a working prototype-level Field Sense flow across backend, Sales Mobile App, and web. It can start/end a server shift, start a Flutter background service, stream GPS points to `fieldLocation.ingest`, store points in `field_locations`, and show live/trail data in the web UI.

It is not production-ready for field usage. The main risk is data loss: the Sales Mobile App stores background points only in memory and explicitly drops failed batches. Offline shift start is not supported. If the network is unavailable, the app process is killed, the token expires, the server has no active shift, or iOS backgrounds the app, location data can be lost or never collected.

The next implementation phase should focus on durable mobile queueing, idempotent backend ingestion, offline shift reconciliation, platform background-location configuration, and ingestion tests. Web UI enhancements should wait until ingestion semantics are correct.

## Reviewed Scope

- Backend routes:
  - `backend/src/trpc/routes/field-location.ts`
  - `backend/src/trpc/routes/field-shifts.ts`
  - `backend/src/trpc/routes/field-attendance.ts`
  - `backend/src/trpc/routes/field-visits.ts`
  - `backend/src/trpc/routes/field-stops.ts`
  - `backend/src/trpc/routes/field-schedule.ts`
- Backend cron/SSE/RBAC:
  - `backend/src/cron/field-auto-start.ts`
  - `backend/src/cron/field-auto-close.ts`
  - `backend/src/app.ts`
  - `backend/src/infra/sse.ts`
  - `backend/src/rbac/modules/field.ts`
- Data model:
  - `schema.prisma`
- Sales Mobile App:
  - `mobile/sales_mobile_app/lib/core/location/background_location_service.dart`
  - `mobile/sales_mobile_app/lib/core/permissions/field_permission_service.dart`
  - `mobile/sales_mobile_app/lib/modules/field/**`
  - `mobile/sales_mobile_app/android/app/src/main/AndroidManifest.xml`
  - `mobile/sales_mobile_app/ios/Runner/Info.plist`
- Current web Field Sense read surfaces:
  - `web/src/pages/dashboard/FieldSenseLiveMapPage.tsx`
  - `web/src/pages/dashboard/FieldSenseShiftsPage.tsx`
  - `web/src/pages/dashboard/FieldSenseVisitsPage.tsx`
  - `web/src/pages/dashboard/FieldSenseStopsPage.tsx`

## Current End-To-End Flow

1. Agent opens Sales Mobile App Field page.
2. App calls `fieldShifts.start`.
3. Backend checks `User.isFieldEnabled`, ensures no active shift, creates `Shift`, and upserts `DailyAttendance`.
4. App starts `BackgroundLocationService`.
5. Background service subscribes to `Geolocator.getPositionStream` with high accuracy and `distanceFilter: 10`.
6. Points are appended to an in-memory `buffer`.
7. Every 10 seconds the service reads `access_token` from secure storage and POSTs up to 500 points to `/fieldLocation.ingest`.
8. Backend finds the active shift for the authenticated agent, writes `FieldLocation.createMany`, then broadcasts the last point over SSE.
9. Web `FieldSenseLiveMapPage` loads `fieldLocation.activeAgents`, opens `/field/live-stream`, and updates live marker positions from SSE.
10. Selecting an agent loads `fieldLocation.trail`, `fieldVisits.forShift`, and `fieldStops.list`.

## What Is Implemented Correctly

- Basic server shift lifecycle exists: start, end, extend, active, list.
- Backend blocks shift start for users without `isFieldEnabled`.
- Backend has a `FieldLocation` table and indexes for agent, shift, org, recorded time, and received time.
- Backend location ingestion accepts batches up to 500 points.
- Backend trail read supports RDP simplification and max-point downsampling.
- Backend active-agent read returns active shifts with latest persisted point.
- Backend live SSE endpoint exists and emits persisted location updates.
- Sales Mobile App starts tracking after server shift start.
- Android manifest contains foreground/background location permissions and foreground service declaration.
- Web live map already consumes active agents, SSE updates, trails, visits, and stops.

## Misconfigurations And Production Gaps

### Critical: Mobile Location Buffer Is In-Memory Only

`background_location_service.dart` stores points in `final buffer = <Map<String, dynamic>>[]`. This buffer is lost if the process dies, service restarts, app crashes, phone reboots, or the OS kills the app.

Required fix:

- Introduce a durable local queue using SQLite/Drift/sqflite.
- Insert each point into the queue before attempting upload.
- Mark points as acknowledged only after backend acceptance.
- Resume upload from disk on app start, service start, network restore, and token refresh.

### Critical: Failed Uploads Are Dropped

The current flush loop removes points from `buffer` before the POST. On network error, 5xx, timeout, or most non-401 failures, the comment says `drop batch, keep running`. This directly violates field tracking reliability.

Required fix:

- Never delete points before acknowledgement.
- Maintain retry state: pending, in-flight, acknowledged, rejected.
- Retry retryable failures with backoff.
- Keep explicit reject reasons for non-retryable failures.

### Critical: Offline Shift Start Is Not Supported

`FieldHomePage._startShift()` must successfully call `fieldShifts.start` before starting location tracking. If offline, it only shows `Network unavailable. Try again.` and no location capture starts.

Required fix:

- Add local shift lifecycle with `clientShiftId`.
- Allow offline local shift start for authenticated/cached eligible agents.
- Sync shift start later via idempotent backend endpoint.
- Link queued points to `clientShiftId` until server `shiftId` is resolved.

### Critical: Backend Ingestion Requires Existing Active Server Shift

`fieldLocation.ingest` looks up `{ agentId, status: "active" }`. If no active shift exists, it returns `{ accepted: 0 }`. This cannot support offline shift start or late sync after auto-close.

Required fix:

- Extend ingestion to resolve by `clientShiftId` and create/recover shift when needed.
- Support late point upload for recently completed shifts when point timestamps fall within shift bounds or an offline local shift event proves continuity.
- Return structured rejection reasons instead of silently accepting zero.

### Critical: No Idempotency Or Duplicate Protection

`FieldLocation` has no `clientPointId`, unique constraint, or ingestion event table. Retrying the same batch will create duplicate rows.

Required fix:

- Add `clientPointId` to `FieldLocation`.
- Add unique index like `(orgId, agentId, clientPointId)`.
- Return duplicate counts as successful acknowledgements.

### Critical: iOS Background Location Is Misconfigured

`Info.plist` lacks location usage descriptions and `UIBackgroundModes` for `location`. The Flutter service has `onBackground`, but iOS will not reliably run continuous background location without proper platform configuration and user permission flow.

Required fix:

- Add required plist keys and Xcode background mode capability.
- Implement iOS-appropriate location strategy rather than relying on a generic periodic timer.
- Validate on a physical iOS device.

### High: Permissions Are Requested Too Early And Too Broadly

`AppBootstrap.run()` calls `FieldPermissionService.requestAll()` before the UI is shown. This asks for foreground location, background location, and battery optimization exemption at startup, even before the user starts a shift.

Problems:

- Poor user trust and high denial rate.
- Android background permission flow often requires contextual education and sometimes settings navigation.
- App does not block shift start based on `FieldPermissionStatus`; the result is ignored.

Required fix:

- Request permissions just before first shift start.
- Show a pre-permission explanation screen.
- Persist and display permission health.
- Block/guide shift start when required permissions are missing.

### High: Token Refresh Is Not Handled In Background Service

The background service reads `access_token` every flush. If the token is expired, a 401 stops the service. It does not use the app's refresh-token flow.

Required fix:

- Background sync should refresh tokens or signal the main app to refresh.
- If refresh cannot happen, keep points queued and show a sync-auth-required state.
- Do not stop and lose tracking simply because one token expired.

### High: Org Scoping Is Incomplete On Read Routes

Several backend read routes accept `agentId`, `shiftId`, `orgId`, or date filters without consistently scoping to `ctx.actor.orgId`. `fieldLocation.trail`, `fieldLocation.agentTrail`, `fieldVisits.forShift`, and similar routes can read by identifier if the caller has `field:read`.

Required fix:

- Scope all field reads by actor org unless caller has super-admin/global override.
- Validate target shift/agent belongs to the caller's org.
- Add tests for cross-org denial.

### High: Sales App Field Access Uses Permission Only, Not `isFieldEnabled`

The existing plan says Field Sense is visible when `auth.me` returns `isFieldEnabled`. In the current Sales Mobile App, `AuthUser` does not include `isFieldEnabled`; UI uses role permission checks such as `field:read`/`field:write` via `canUseFieldProvider`.

Required fix:

- Add `isFieldEnabled` to mobile `AuthUser` parsing if backend returns it.
- Gate Field Sense on both user enablement and permissions.
- Keep backend as final authority.

### High: No Durable Device/Sync Health Model

There is no server-side device identity, app version, platform, queue depth, last sync error, or tracking health. Web cannot distinguish healthy stationary agent from dead telemetry.

Required fix:

- Add mobile heartbeat/sync status endpoint.
- Store device/app metadata and last upload health per agent/shift.
- Expose `lastRecordedAt`, `lastReceivedAt`, upload lag, and stale state.

### Medium: Batch Response Is Too Weak

`fieldLocation.ingest` returns only `{ accepted }`. It cannot tell the client which points were duplicates, rejected, or retryable.

Required fix:

- Return batch acknowledgement with accepted IDs, duplicate IDs, rejected IDs/reasons, and retry-after hints.

### Medium: Coordinates Are Under-Validated

The zod schema accepts any number for lat/lng/accuracy. It does not enforce latitude between -90 and 90, longitude between -180 and 180, accuracy minimum/maximum, timestamp sanity, or mock-location flags.

Required fix:

- Add coordinate and timestamp validation.
- Flag low-quality or suspicious points rather than mixing them silently with trusted points.

### Medium: Visit And Stop Offline Flow Is Missing

Visit and stop creation require active server shift and network. They are not durable offline events.

Required fix:

- Add local event queue for visits/stops.
- Sync idempotently with client event IDs.
- Reconcile stop start/end pairs.

### Medium: Visit Audio Is Placeholder-Level

`CreateVisitPage` has an audio/media URL text field but does not record/upload audio. The earlier plan expected `record`, `audioplayers`, and presigned attachment upload. Current `pubspec.yaml` does not include those packages.

Required fix:

- Either remove the placeholder from production UI or implement managed recording/upload.

### Medium: Auto-Start/Auto-Close Can Conflict With Offline Client State

Backend auto-start can create a shift while a device has an unsynced offline manual shift. Auto-close can complete a shift before queued points arrive. Current ingestion then returns zero if the shift is no longer active.

Required fix:

- Add reconciliation rules between client shift events and cron-created shifts.
- Accept late points for the reconciled shift under defined windows.

### Medium: Web SSE Auth Uses Dev Actor Header Pattern

Web `openFieldSenseStream` uses `x-actor-id` from local storage rather than a production bearer/session credential path. Backend accepts direct `x-actor-id` for internal callers.

Required fix:

- For production web, use real auth credentials/cookies/bearer token.
- Restrict direct `x-actor-id` to trusted internal/dev environments only.

### Low: Sales Mobile App Map Uses Public OSM Tiles Directly

The mobile agent map uses OpenStreetMap public tiles. This is acceptable for prototype but should be reviewed for production usage policy, caching, attribution, and rate limits.

Required fix:

- Use an approved tile provider or self-hosted/proxied map tiles if production map traffic is expected.

## Recommended Production Architecture

### Mobile

- `LocalFieldStore`: SQLite tables for shifts, points, visits, stops, sync attempts, and device health.
- `LocationCaptureService`: only captures and persists points; does not own server truth.
- `FieldSyncWorker`: uploads pending shifts/events/points with backoff and idempotency.
- `PermissionHealthService`: tracks foreground/background/battery/location-service state.
- `ShiftController`: manages local and server shift state transitions.

### Backend

- `fieldShifts.syncStart` and `fieldShifts.syncEnd` using `clientShiftId` and `clientEventId`.
- `fieldLocation.ingestV2` using `clientPointId`, `clientShiftId`, optional `shiftId`, and batch acknowledgement.
- Unique constraints for idempotency.
- Device/sync health table keyed by agent/device/shift.
- Strict org-scoped read policies.
- Integration tests for offline and duplicate behavior.

### Web

- Consume persisted latest point and SSE for live display.
- Show health states: live, delayed, stale, offline queue syncing, permission issue, auth issue.
- Show trail gaps and upload lag.
- Defer richer UI until ingestion V2 is in place.

## Suggested Implementation Order

1. Add backend schema fields for `clientShiftId`, `clientPointId`, device metadata, and sync status.
2. Add idempotent backend shift sync and location ingestion V2 endpoints.
3. Add backend tests for duplicates, offline shift reconciliation, late points, and cross-org reads.
4. Replace mobile in-memory buffer with durable queue.
5. Add mobile offline shift start/end and sync worker.
6. Fix Android permission timing and battery optimization UX.
7. Add iOS plist/capabilities and validate real background behavior.
8. Add mobile telemetry health upload.
9. Update web live map later to show health, trails, gaps, and agent details.

## Minimum Test Matrix Before Production

- Start shift online, upload points, end shift online.
- Start shift offline, collect points, kill app, reopen, reconnect, sync all points.
- Upload same batch twice; backend stores one copy.
- Token expires while queue has points; app refreshes or preserves queue until login.
- Backend auto-closes shift, then receives late offline points within allowed window.
- Network fails mid-batch; no points are lost.
- App loses foreground service and restarts; tracking resumes or shows explicit failure.
- Background permission denied; shift start is blocked or degraded with clear UX.
- Cross-org web user cannot read another org's trail/shift/visit/stop.
- SSE emits only after points persist.

## Bottom Line

The current implementation is a strong prototype but unsafe for production field tracking. The immediate priority is not more map UI; it is to make the Sales Mobile App and backend ingestion lossless, idempotent, offline-capable, and platform-compliant. Once that data pipeline is reliable, the web UI can confidently render live locations, trails, visits, stops, and operational health.
