# Target Architecture

## Architecture Principle

Field Sense has one production path:

```text
mobile local persistence
  -> sync worker
  -> backend V2 contracts
  -> canonical database
  -> supervisor dashboard and SSE
```

Screens do not own writes. Screens request actions from a controller, the controller
persists local state first, and the sync worker talks to the backend.

## Components

### Mobile

- `FieldShiftController`: owns shift lifecycle and runtime state.
- `FieldLocalStore`: owns SQLite-backed shifts, location points, field events, and health state.
- `LocationCaptureService`: owns GPS stream and writes points locally.
- `FieldSyncWorker`: owns backend sync, ack handling, retries, and backoff.
- `FieldPermissionCoordinator`: owns foreground/background location, notification, and battery state.
- `FieldRepository`: wraps backend V2 calls only; no local state ownership.
- Field screens: render state and dispatch commands only.

### Backend

- `fieldShifts`: shift lifecycle authority.
- `fieldLocation`: location ingest, trail reads, active-agent reads, SSE broadcast source.
- `fieldSyncStatus`: device and sync health store.
- `fieldVisits`, `fieldStops`, `fieldAttendance`, `fieldSchedule`: operational Field modules.
- `field-helpers`: shared enablement, permission, org, and validation logic.

### Web Supervisor

- Live map.
- Field operations dashboard.
- Shift list and detail.
- Attendance management.
- Visit and stop visibility.
- Schedule management.
- Timeline/replay.
- Diagnostics and health classification.

## Data Flow

### Shift Start

```text
User taps Start Shift
  -> FieldPermissionCoordinator checks permissions
  -> FieldShiftController creates local shift with clientShiftId
  -> LocationCaptureService starts writing points locally
  -> FieldSyncWorker calls fieldShifts.syncStart
  -> backend returns serverShiftId
  -> FieldLocalStore stores serverShiftId
  -> FieldSyncWorker reports fieldSyncStatus.upsert
```

### Location Capture

```text
GPS point received
  -> LocationCaptureService creates clientPointId
  -> FieldLocalStore inserts pending point
  -> FieldSyncWorker picks pending batch
  -> fieldLocation.ingestV2
  -> accepted/duplicate/rejected ack
  -> FieldLocalStore updates row states
  -> backend broadcasts latest point over SSE
  -> supervisor live map updates
```

### Shift End

```text
User taps End Shift
  -> FieldShiftController marks local shift ending_pending
  -> LocationCaptureService stops capture
  -> FieldSyncWorker flushes pending points as possible
  -> FieldSyncWorker calls fieldShifts.syncEnd
  -> local shift becomes completed after backend ack
  -> health report records final queue depth
```

## Ownership Boundaries

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| Field screens | UI state, commands, user feedback | direct network writes, queue mutation |
| Controller | lifecycle state, orchestration | backend persistence details |
| Local store | durable local rows and state transitions | HTTP calls |
| Sync worker | backend sync and ack handling | UI rendering |
| Repository | tRPC request wrappers | runtime state, retry policy |
| Backend routes | canonical server state and validation | mobile local queue behavior |
| Web dashboard | operational visibility and admin commands | mobile sync decisions |

## Current Gaps Against Target

- Sales mobile has no `FieldShiftController`.
- Sales mobile has no SQLite `FieldLocalStore`.
- Location queue uses secure-storage JSON and drops oldest points after a cap.
- Background service requires server shift id before running, blocking true offline start.
- Field screens still perform direct repository mutations for visits, stops, attendance, and schedule.
- Web supervisor pages do not yet expose complete health and truncation states.
- Backend health is stored, but no canonical health classification enum exists.
- Some Field backend tests are stale against current auth middleware.

## Architecture Guardrails

- Introduce one canonical mobile runtime before deleting legacy-looking files.
- Keep `FieldRepository` as an adapter, not a state owner.
- Do not add a second background service implementation.
- Do not let web compatibility shims become production data sources.
- If a compatibility route remains, document owner, reason, and deletion criteria.
