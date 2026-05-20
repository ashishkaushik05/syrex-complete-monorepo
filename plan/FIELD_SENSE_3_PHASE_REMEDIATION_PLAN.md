# Field Sense 3-Phase Remediation Plan

## Objective

Make Field Sense production-ready for reliable Sales Mobile App location ingestion before expanding web UI. The target state is: offline shift start works, every location point is durably queued, backend ingestion is idempotent, live location is based on persisted accepted points, and web can later render trustworthy trails and health status.

## Ownership

- Backend implementation owner: Codex.
- Sales Mobile App implementation owner: mobile handling agent/user-assigned mobile agent.
- Web UI implementation: deferred until Phase 1 and Phase 2 ingestion contracts are stable.

## Non-Negotiable Architecture Rules

- Sales Mobile App is the only writer of field location data.
- Backend is the source of truth for persisted shifts, points, visits, stops, attendance, and live stream events.
- Web UI is read-only for location/trail visibility in this remediation scope.
- All write APIs must be idempotent.
- Client-generated IDs are required for offline-first sync.
- No uploaded point may be deleted from mobile local storage before backend acknowledgement.
- Backend must never silently drop valid offline points just because a server shift is not currently active.

---

## Phase 1: Backend Ingestion Contract And Data Safety

### Goal

Create a reliable backend contract that can safely receive duplicate, delayed, and offline-originated mobile data without data loss or duplicate storage.

### Backend Scope

- Add schema support for client identifiers:
  - `Shift.clientShiftId`
  - `FieldLocation.clientPointId`
  - optional `FieldLocation.source`, `platform`, `appVersion`, `capturedAt`, `speed`, `heading`, `altitude`, `isMocked`
  - optional field sync/device health table
- Add unique constraints:
  - `Shift`: `(orgId, agentId, clientShiftId)` where supported by Prisma/database strategy
  - `FieldLocation`: `(orgId, agentId, clientPointId)`
- Add idempotent shift sync routes:
  - `fieldShifts.syncStart`
  - `fieldShifts.syncEnd`
- Add ingestion V2 route:
  - `fieldLocation.ingestV2`
- Keep current `fieldLocation.ingest` temporarily for compatibility, but treat V2 as the primary implementation path.
- Add structured batch acknowledgement:
  - accepted count/IDs
  - duplicate count/IDs
  - rejected IDs with reason
  - retryable failure marker where needed
- Add coordinate/timestamp validation.
- Add org-scoped authorization checks on all field read routes touched by this phase.
- Add backend tests for idempotency, duplicate batches, offline shift resolution, and cross-org denial.

### Mobile Scope

- No production mobile behavior dependency in Phase 1 except contract review.
- Mobile agent should prepare local model names to match backend V2 contract.

### Deliverables

- Database migration.
- Updated Prisma schema.
- V2 backend routes.
- Contract notes for mobile agent.
- Backend tests.

### Acceptance Criteria

- Uploading the same batch twice stores one copy and returns duplicates as acknowledged.
- A batch with `clientShiftId` can resolve to an existing server shift.
- Invalid coordinates are rejected with explicit reasons.
- Cross-org users cannot read another org's shift/trail/visit/stop data.
- SSE emits only after points persist.

---

## Phase 2: Sales Mobile Offline Queue And Sync Worker

### Goal

Make the Sales Mobile App lossless under network loss, token expiry, app restart, process death, and offline shift start/end.

### Backend Scope

- Support mobile testing/debugging of V2 routes.
- Adjust V2 route response shape only if mobile implementation exposes a contract issue.
- Add health endpoint if not completed in Phase 1:
  - `fieldSyncStatus.upsert` or equivalent.

### Mobile Scope

- Add durable local database for:
  - local shifts
  - location points
  - visit events
  - stop events
  - sync attempts/state
- Implement offline local shift start:
  - create `clientShiftId`
  - start location capture immediately
  - queue shift start event
- Implement offline local shift end:
  - queue shift end event
  - keep sync worker active until pending data is acknowledged
- Replace in-memory location buffer with durable queue.
- Add sync worker:
  - sync shift start first
  - upload points in ordered batches
  - sync visits/stops after shift resolution
  - retry with exponential backoff
  - keep points until acked or explicitly rejected
- Handle token expiry:
  - refresh token where possible
  - preserve queue if re-authentication is required
- Improve permission flow:
  - request permissions at shift start, not app bootstrap
  - show background-location and battery-optimization status
  - block or warn clearly when tracking cannot be reliable
- Add platform configuration:
  - iOS plist background location keys and capabilities
  - Android foreground service notification/channel validation
- Add mobile tests or manual test scripts for offline queue behavior.

### Deliverables

- Durable queue implementation.
- Offline shift lifecycle implementation.
- Background sync worker.
- Permission/health UX.
- iOS/Android production configuration.
- Mobile handoff validation results.

### Acceptance Criteria

- Starting shift offline records points locally.
- Killing the app after recording points does not lose them.
- Reconnecting network syncs shift and all points exactly once.
- Token expiry does not delete queued points.
- Ending a shift offline later syncs to backend.
- Backend web active-agent data reflects uploaded points after sync.

---

## Phase 3: Production Hardening, Observability, And Web Readiness

### Goal

Make Field Sense operable in production with diagnostics, health visibility, and clean web-read contracts.

### Backend Scope

- Add sync/device health persistence if not already complete:
  - last captured point time
  - last received point time
  - last sync attempt
  - last sync error code
  - queue depth reported by mobile
  - app/platform version
  - permission health flags where provided
- Add read endpoints for web health panels:
  - active agents with health status
  - shift summary with distance, point counts, gaps
  - trail gaps/offline sync windows
- Add retention policy plan for raw points and summaries.
- Add audit logging for shift lifecycle and admin reads if required.
- Load/performance test large trail reads.

### Mobile Scope

- Upload periodic sync health heartbeat.
- Surface user-facing tracking health:
  - tracking active
  - location permission missing
  - background permission missing
  - queue pending
  - sync failed/retry scheduled
- Add QA scripts for device-specific battery behavior.

### Web Scope

- After backend/mobile ingestion is stable, update UI to show:
  - live/stale/offline status
  - trail gaps
  - queue/sync health
  - visits/stops overlays
  - shift-level audit summary

### Acceptance Criteria

- Supervisor can distinguish live tracking from stale/no telemetry.
- A completed shift shows trail, distance, duration, raw/simplified point counts, visits, and stops.
- Health endpoint identifies stale agents without relying on SSE alone.
- Production runbook exists for debugging missing location data.

## Phase Gate Summary

- Phase 1 gate: backend can safely receive idempotent offline-originated batches.
- Phase 2 gate: mobile can generate and sync those batches without data loss.
- Phase 3 gate: operations team can observe, diagnose, and trust the location system in production.
