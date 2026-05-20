# Field Sense Location Ingestion Requirements

## Purpose

Field Sense must reliably receive, store, and expose sales-agent location data from the Sales Mobile App. The first production milestone is not web visualization polish; it is a dependable end-to-end data pipeline from the sales app to backend storage, including offline shift start and offline location capture.

## Current Product Boundary

- The Sales Mobile App is the only client that records and uploads agent location data.
- The backend is the only authority for persisted shifts, attendance, visits, stops, and location trails.
- The web UI is the only surface for supervisors/admins to view live location, trails, shifts, visits, stops, and attendance.
- This requirements document focuses on ingestion readiness. Web UI implementation improvements are a later phase after ingestion is correct.

## Actors

- `Sales agent`: internal user using `mobile/sales_mobile_app` with Field Sense enabled.
- `Supervisor/admin`: internal user using the web UI with `field:read` or `field:admin` permissions.
- `System`: backend cron/service process that can auto-start or auto-close shifts based on schedules.

## Required Core Flow

1. Agent starts a shift in the Sales Mobile App.
2. App starts foreground/background location tracking.
3. App records location points continuously while the shift is active.
4. App stores every point durably on-device before upload.
5. App uploads points in batches whenever the network and auth state allow it.
6. Backend accepts batches idempotently and associates points with the correct shift.
7. Backend broadcasts the latest accepted point to live web subscribers.
8. Backend stores enough raw data to reconstruct a trail and enough summary metadata to power dashboards.
9. Agent ends the shift.
10. App flushes all pending points, marks the local shift closed, and stops background tracking only after a safe shutdown path.

## Offline-First Requirements

### Offline Shift Start

- The app must allow shift start when the device is offline if the user has a valid local session and Field Sense eligibility cached from a previous successful login.
- Offline shift start must create a local shift record with a generated `clientShiftId`.
- The app must immediately start durable location capture after local shift start.
- When network returns, the app must sync the offline shift start to the backend.
- The backend must either create a server shift mapped to `clientShiftId` or return the existing server shift if the same client shift was already synced.
- All queued location points captured before server shift creation must later upload against the resolved server `shiftId`.

### Offline Location Capture

- Location points must be written to a local durable queue before any network call.
- The queue must survive app restart, process death, foreground-service restart, OS kill, device reboot, and token refresh.
- The queue must preserve point order per `clientShiftId`.
- The app must not drop points on network errors, HTTP 5xx, timeout, DNS failure, or temporary 4xx caused by shift-sync race.
- The queue must support retry with exponential backoff and jitter.
- The app must enforce bounded storage with visible health warnings if the queue grows beyond configured limits.

### Offline Shift End

- The app must allow local shift end while offline.
- The app must keep uploading queued points after local shift end until all points are acknowledged or until explicit user logout/admin policy prevents sync.
- The backend must accept shift-end sync idempotently using `clientShiftId` and `clientEventId`.
- If the backend auto-closed a shift before the offline end sync arrives, it must reconcile the client end event without losing location data.

## Location Point Contract

Every point uploaded from the app should include:

- `clientPointId`: stable UUID generated on-device for idempotency.
- `clientShiftId`: stable UUID generated on-device for offline shift association.
- `shiftId`: nullable server shift ID once known.
- `agentId`: derived from auth server-side, not trusted from client payload.
- `orgId`: derived from auth/server shift where possible, not trusted blindly from client payload.
- `lat`, `lng`: numeric coordinates with validation ranges.
- `accuracy`: horizontal accuracy in meters.
- `altitude`: optional.
- `altitudeAccuracy`: optional.
- `speed`: optional meters/second.
- `speedAccuracy`: optional.
- `heading`: optional degrees.
- `headingAccuracy`: optional.
- `recordedAt`: device GPS timestamp.
- `capturedAt`: app enqueue timestamp.
- `receivedAt`: server timestamp.
- `source`: `foreground`, `background`, `restart_recovery`, or `manual_fix`.
- `provider`: Android/iOS provider if available.
- `batteryPct`: optional battery percentage.
- `isMocked`: optional device/platform mock-location signal.
- `appVersion`, `platform`, `platformVersion`: required for production diagnostics.

## Backend Ingestion Requirements

- Provide a batch endpoint that can accept up to a configured maximum, initially `500` points per request.
- Accept idempotency keys and de-duplicate by `(orgId, agentId, clientPointId)`.
- Accept points for a client-created offline shift before the server shift exists, or perform shift resolution in the same batch request.
- Return per-point or per-batch acknowledgement including accepted, duplicate, rejected, and retryable counts.
- Reject invalid coordinate ranges, impossible accuracy values, and malformed timestamps with explicit reason codes.
- Treat stale points separately from invalid points; old-but-valid offline points should still be accepted within a defined retention window.
- Preserve raw points. Trail simplification must be a read-time or derived-cache concern, not a destructive ingestion step.
- Broadcast only after persistence succeeds.
- Protect cross-org reads and writes; every read route must scope to actor org unless the caller has an explicit global/super-admin path.
- Expose ingestion health metrics: last received point, queue lag, dropped/rejected count, last sync error, device/app version.

## Mobile Background Service Requirements

### Android

- Use a foreground service with `foregroundServiceType="location"`.
- Request foreground location before background location.
- Do not request all Field Sense permissions blindly on app bootstrap; request at the point of need with clear UX.
- Detect and explain missing permissions, background denied, location services disabled, approximate-only permission, and battery optimization not exempted.
- Persist queue in SQLite/Drift or equivalent durable local database, not in memory.
- Use WorkManager or a background retry mechanism for sync in addition to the foreground service.
- Handle Doze, app standby, OEM battery killers, process death, and reboot recovery as much as Android allows.
- Show a persistent notification while tracking.
- Stop tracking only when the local shift is ended and pending sync is safely handled.

### iOS

- Add `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, and `NSLocationAlwaysUsageDescription` where applicable.
- Add `UIBackgroundModes` with `location`.
- Enable Xcode background location capability.
- Use platform-appropriate continuous location behavior; generic timer-based background loops are not reliable on iOS.
- Provide user-facing disclosure that location is collected during active shifts.
- Support deferred/batched location updates where appropriate.

## Shift and Attendance Requirements

- Shift lifecycle must support `server-created`, `client-created-pending-sync`, `active`, `ending-pending-sync`, `completed`, `auto-closed`, and `sync-conflict` states.
- One active server shift per agent remains the canonical invariant, but offline client state must support pending local shifts until reconciliation.
- Attendance should not be inferred solely from shift start if offline reconciliation can arrive late; attendance updates must be idempotent and auditable.
- Auto-start must be reconciled with client offline manual start to avoid duplicate active shifts.
- Auto-close must not prevent late offline points from being accepted for the correct shift.

## Visits and Stops Requirements

- Visit and stop records must also support offline creation with durable local IDs.
- Visit/stop sync should follow the same idempotent event pattern as shifts and locations.
- Stops must support offline start/end reconciliation.
- Visit media/audio should not be considered production-ready until the app uploads binary media through a managed attachment flow, not manual URL entry.

## Web Read Requirements For Later UI Phase

- Show live location for active agents from persisted latest point plus SSE updates.
- Show last sync age and tracking health per agent.
- Show trail by shift and by date range.
- Show visits/stops overlaid on trails.
- Show raw point count, simplified point count, duration, distance, and gaps.
- Show gaps/offline sync windows explicitly so supervisors can distinguish no movement from no telemetry.
- Provide export/audit capability for a shift trail.

## Security, Privacy, And Compliance Requirements

- Location collection must be tied to active shift state and visible to the user.
- Do not collect location when the user is off shift except for final safe flush mechanics.
- Sales app writes must be limited to the authenticated agent's own field data.
- Web reads must be scoped to allowed org and permissions.
- Store enough audit metadata to answer who tracked whom, when, and why.
- Add retention policy for raw points and derived trail summaries.
- Detect mock locations where possible and flag them rather than silently trusting them.

## Production Acceptance Criteria

- Starting a shift offline records points locally and later creates/syncs exactly one backend shift.
- Killing and reopening the app does not lose queued points.
- Disabling and re-enabling network uploads all queued points in order without duplicates.
- Token expiry during tracking does not lose points; sync resumes after refresh/login.
- Backend batch ingestion is idempotent under repeated requests.
- Web active-agent endpoint shows latest persisted point after upload.
- SSE emits latest point after accepted ingest.
- iOS and Android manifests/capabilities pass platform background-location requirements.
- Automated tests cover shift start/end, duplicate batch upload, no active shift handling, offline reconciliation, and read-side org scoping.
