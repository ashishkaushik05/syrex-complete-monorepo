# Mobile Canonical Runtime

## Scope

This document applies to `mobile/sales_mobile_app`, the active sales mobile runtime.
It does not authorize deletion of `mobile/outlet_owner_template` Field files.

## Current State

The app already has:

- Field tab gating through `canUseFieldProvider`.
- Direct `/field` redirect guard when Field Sense is unavailable.
- Field routes for home, visit, stop, attendance, map, schedule, and shift history.
- A repository with V2 methods for `syncStart`, `syncEnd`, `ingestV2`, and health upsert.
- A background service that captures GPS and uploads to `fieldLocation.ingestV2`.

The app still lacks:

- a single runtime owner
- SQLite-backed local persistence
- local-first offline shift start
- durable per-point state
- durable retry/backoff state
- offline visit/stop events
- controller-owned UI actions

## Required Mobile Components

### FieldLocalStore

Use SQLite through `sqflite`, Drift, or an equivalent durable local database.

Responsibilities:

- create local shifts
- persist every point before upload
- store server shift id after `syncStart`
- query pending point batches in stable order
- mark points accepted, duplicate, rejected, failed, or pending
- store local field events
- expose queue depth and local health
- preserve data across process death

### FieldShiftController

Responsibilities:

- own active shift state
- start shifts locally before network sync
- end shifts locally before backend sync
- start and stop location capture
- expose sync state, queue depth, GPS state, attendance state, and stop state
- recover active shift from local store on app launch
- prevent duplicate starts, duplicate ends, and duplicate sync triggers

### LocationCaptureService

Responsibilities:

- subscribe to foreground/background location updates
- generate `clientPointId`
- write every point to `FieldLocalStore`
- avoid network calls
- filter obviously invalid local points before persistence only when the reason is deterministic

### FieldSyncWorker

Responsibilities:

- call `fieldShifts.syncStart` for local shifts without server id
- call `fieldLocation.ingestV2` for pending points in batches of at most 500
- call `fieldShifts.syncEnd` for ending shifts
- call `fieldSyncStatus.upsert` with queue and permission state
- handle accepted, duplicate, rejected, retryable, network error, 5xx, and 401 states
- preserve data on auth failure
- use backoff to prevent tight retry loops

### FieldPermissionCoordinator

Responsibilities:

- check location service enabled
- request foreground location at Field start flow
- request background location only when user starts tracking
- check notification permission where required
- check Android battery optimization state
- expose permission health to UI and backend

## Local Data Model

### `local_field_shifts`

| Field | Type | Notes |
| --- | --- | --- |
| `clientShiftId` | text primary key | generated on device |
| `serverShiftId` | text nullable | filled after `syncStart` |
| `status` | text | `local_active`, `syncing_start`, `server_active`, `ending_pending`, `completed`, `conflict` |
| `startedAt` | text | ISO datetime |
| `endedAt` | text nullable | local end timestamp |
| `startSyncedAt` | text nullable | backend ack time |
| `endSyncedAt` | text nullable | backend end ack time |
| `lastErrorCode` | text nullable | last lifecycle error |
| `createdAt` | text | local create time |
| `updatedAt` | text | local update time |

### `local_location_points`

| Field | Type | Notes |
| --- | --- | --- |
| `clientPointId` | text primary key | sent to backend |
| `clientShiftId` | text indexed | local shift id |
| `serverShiftId` | text nullable | filled after start sync |
| `lat` | real | latitude |
| `lng` | real | longitude |
| `accuracy` | real | meters |
| `recordedAt` | text | device GPS timestamp |
| `capturedAt` | text | app capture timestamp |
| `source` | text | foreground, background, restart_recovery |
| `altitude` | real nullable | optional |
| `speed` | real nullable | optional |
| `heading` | real nullable | optional |
| `isMocked` | integer nullable | platform signal |
| `syncStatus` | text | pending, in_flight, acked, duplicate, rejected, failed |
| `syncAttempts` | integer | retry count |
| `lastErrorCode` | text nullable | error or rejection reason |
| `createdAt` | text | local create time |
| `updatedAt` | text | local update time |

### `local_field_events`

Use for visits, stops, attendance changes, and future media events.

| Field | Type | Notes |
| --- | --- | --- |
| `clientEventId` | text primary key | generated on device |
| `clientShiftId` | text indexed | local shift id |
| `serverShiftId` | text nullable | filled after start sync |
| `eventType` | text | visit, stop_start, stop_end, attendance |
| `payloadJson` | text | canonical event payload |
| `syncStatus` | text | pending, in_flight, acked, rejected, failed |
| `serverId` | text nullable | backend id when available |
| `syncAttempts` | integer | retry count |
| `lastErrorCode` | text nullable | error or rejection reason |
| `createdAt` | text | local create time |
| `updatedAt` | text | local update time |

## Migration Plan

1. Add local store and schema.
2. Add controller and wire Field home through controller.
3. Move background service persistence from secure storage into local store.
4. Add sync worker and ack handling.
5. Remove production use of secure-storage point queue.
6. Convert visit/stop/attendance writes to local event flow where required.
7. Add local diagnostics UI.

## Mobile Acceptance Tests

- start shift with network disabled
- capture points with network disabled
- kill app and reopen during active shift
- reconnect and sync without duplicates
- expire access token during active shift
- backend returns `retryable: true`
- backend returns rejected point reasons
- end shift while offline and sync later
- deny background permission and verify health state
- queue grows without silent data loss
