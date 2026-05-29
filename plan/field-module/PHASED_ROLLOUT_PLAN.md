# Phased Rollout Plan

## Execution Model

Work is split into four production phases. Each phase must have its own decision-log
entry before code changes and a final update after verification.

Teams:

- Team A: Mobile Core And Runtime
- Team B: Supervisor Dashboard And Operations
- Team C: Backend Reliability And Contracts
- Team D: QA, Device Testing, And Production Readiness

## Phase 0: Documentation And Scope Freeze

Status: current documentation phase.

Goals:

- freeze target architecture
- separate active sales mobile runtime from outlet template files
- define backend V2 contracts as canonical
- document exact implementation slices

Deliverables:

- plan package under `plan/field-module`
- decision-log entry for documentation completion
- backlog with owner lanes and acceptance gates

Exit gate:

- docs are present and internally consistent
- implementation teams can start without inventing contracts

## Phase 1: Canonical Mobile Runtime

Goal: make sales mobile Field Sense one local-first runtime.

Team A scope:

- add `FieldLocalStore` using SQLite/sqflite or Drift
- add `FieldShiftController`
- add `FieldSyncWorker`
- split GPS capture into `LocationCaptureService`
- migrate current `FieldHomePage` orchestration into controller-owned flow
- replace secure-storage JSON point queue with local database tables
- preserve active shift and pending points across restart
- stop dropping oldest points silently

Team C support:

- verify `syncStart`, `ingestV2`, `syncEnd`, and `fieldSyncStatus.upsert` contracts
- fix stale Field ingestion tests where auth mocks no longer satisfy current middleware

Team D validation:

- offline start
- offline point capture
- app kill/reopen
- reconnect sync
- duplicate upload
- token expiry while tracking

Exit gate:

- mobile can start a shift locally before backend sync
- points are persisted before upload
- points are deleted only after accepted, duplicate, or rejected ack
- app restart restores active shift and pending queue

## Phase 2: Supervisor Operations Visibility

Goal: make supervisors see operational health, not just location data.

Team B scope:

- add Field operations dashboard
- surface queue size, last captured, last received, last sync, last error
- surface permission and battery state from sync health
- add `activeAgents.hasMore` warning and pagination strategy
- add stale agent warnings on live map
- align schedule page permissions with backend admin requirements
- remove placeholder REST compatibility paths from `web/src/lib/api.ts` after callers are migrated

Team C support:

- add agent health classification in backend response or shared mapper:
  - `ACTIVE`
  - `DELAYED`
  - `STALE`
  - `OFFLINE`
  - `GPS_DISABLED`
  - `SHIFT_DESYNC`
- make health classification deterministic and tested

Team D validation:

- supervisor can identify stale queue, denied permissions, GPS-disabled device, and offline device
- schedule management fails closed for users without `field:admin`

Exit gate:

- supervisor can explain why an agent is not live
- live map does not silently hide truncated active-agent results
- no dead REST shims remain for active Field dashboard paths

## Phase 3: Reliability Hardening

Goal: survive real-world network, crash, and device behavior.

Team A scope:

- background service restart handling
- sync backoff and retry state
- token refresh and re-auth preservation
- GPS filtering for impossible jumps, stale timestamps, duplicates, and low-quality points
- local diagnostics screen for queue and permissions
- offline event queue for visits/stops if required for production

Team C scope:

- structured logs for sync paths
- ingestion metrics
- SSE reliability checks
- active-agent index review
- batch ingest scalability tests
- rejected-point reason distribution

Team B scope:

- shift timeline and replay
- diagnostics panel per agent
- force-refresh/manual retry commands where safe

Team D validation:

- server downtime
- intermittent internet
- airplane mode
- app crash during sync
- duplicate batch replay
- server auto-close while device has pending points

Exit gate:

- sync failures self-heal
- queue does not corrupt after crash
- server and supervisor tools can diagnose failure reasons

## Phase 4: Production Rollout

Goal: release with monitoring, support procedures, and acceptance evidence.

Team A scope:

- mobile UX polish for offline, queue, and sync indicators
- duplicate-sync trigger cleanup
- final platform permission copy

Team B scope:

- operational analytics:
  - total active agents
  - average sync latency
  - stale agents
  - attendance compliance
  - stop and visit analytics
- live map clustering and trail rendering performance

Team C scope:

- alert dashboards
- queue backlog monitoring
- SSE monitoring
- security review
- org isolation regression tests

Team D scope:

- 8 to 12 hour tracking tests
- Android device matrix
- iOS physical-device validation if iOS is in release scope
- production acceptance checklist

Exit gate:

- all success criteria pass
- operations runbook exists
- decision-log entries for implementation slices are completed

## Sequencing Rule

Do not build advanced supervisor analytics before the mobile local-first runtime is
durable. Without reliable queue and health reporting from mobile, supervisor analytics
will mislead operators.
