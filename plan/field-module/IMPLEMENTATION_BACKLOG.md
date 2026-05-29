# Implementation Backlog

## P0: Planning And Test Maintenance

### P0-1: Complete Documentation Package

Owner: Codex

Scope:

- `plan/field-module/**`
- decision log final update

Acceptance:

- docs exist and cross-link
- current verified repo state is reflected
- no code runtime changes included

### P0-2: Fix Stale Field Ingestion Tests

Owner: Team C

Scope:

- `backend/src/trpc/routes/field-ingestion.test.ts`

Acceptance:

- auth mock includes current required fields such as `isActive`
- `bun test backend/src/trpc/routes/field-ingestion.test.ts` passes

## P1: Canonical Mobile Runtime

### P1-1: Add Field Local Store

Owner: Team A

Scope:

- mobile local DB dependency
- local shift table
- local point table
- local event table
- local health table

Acceptance:

- local active shift survives app restart
- pending points survive app restart
- no secure-storage JSON queue in production point path

### P1-2: Add Field Shift Controller

Owner: Team A

Scope:

- controller provider
- start/end orchestration
- active shift state
- queue and sync state
- service lifecycle calls

Acceptance:

- Field screens no longer perform direct shift lifecycle writes
- duplicate start/end is prevented
- controller recovers from local store on boot

### P1-3: Refactor Location Capture

Owner: Team A

Scope:

- `LocationCaptureService`
- background service integration
- local point persistence

Acceptance:

- GPS points are persisted before upload
- capture can begin before server shift id exists
- no point is silently dropped because of queue cap

### P1-4: Add Field Sync Worker

Owner: Team A

Scope:

- sync start
- point ingest
- sync end
- health reporting
- backoff/retry
- auth failure preservation

Acceptance:

- offline start syncs later
- duplicate batches do not duplicate server data
- rejected points are retained with reason
- `retryable: true` keeps data pending

## P2: Supervisor Operations

### P2-1: Add Operations Dashboard

Owner: Team B

Scope:

- new Field operations route/page
- sync health table
- summary cards
- filters by health state

Acceptance:

- supervisors can see queue depth, last sync, last captured, last error, platform, and app version

### P2-2: Active Agents Truncation

Owner: Team B

Scope:

- live map active agent fetch
- visible warning for `hasMore`
- pagination or scoped filtering

Acceptance:

- live map never silently hides active agents because of cap

### P2-3: Schedule Permission Alignment

Owner: Team B

Scope:

- web route/page action gating
- backend contract verification

Acceptance:

- cross-user schedule controls require `field:admin`
- users without admin cannot trigger forbidden save flows from visible UI

### P2-4: Remove Field REST Shims

Owner: Team B

Scope:

- `web/src/lib/api.ts`

Acceptance:

- no active Field page relies on empty REST shim data
- placeholder Field REST paths are removed or logged as compatibility paths

## P3: Backend Reliability

### P3-1: Structured Sync Logs

Owner: Team C

Scope:

- `field-shifts.ts`
- `field-location.ts`
- `field-sync-status.ts`
- logger usage

Acceptance:

- sync paths log request and correlation ids
- logs include batch counts and failure codes

### P3-2: Health Classification

Owner: Team C

Scope:

- backend active-agent response or shared web mapper
- tests

Acceptance:

- agents classify as `ACTIVE`, `DELAYED`, `STALE`, `OFFLINE`, `GPS_DISABLED`, or `SHIFT_DESYNC`
- thresholds are documented

### P3-3: Metrics And Alerts

Owner: Team C

Scope:

- ingest metrics
- sync latency
- SSE health
- queue backlog alerts

Acceptance:

- operations can alert on stale, queue, ingest, and SSE failures

## P4: Offline Events And Replay

### P4-1: Offline Visits And Stops

Owner: Team A and Team C

Scope:

- mobile local event table use
- backend event idempotency
- event sync worker

Acceptance:

- visits/stops created offline sync exactly once
- rejected events retain reason

### P4-2: Timeline Replay

Owner: Team B

Scope:

- shift replay page
- path playback
- visits/stops/attendance overlay
- signal gap display

Acceptance:

- supervisor can replay a completed shift and identify gaps

## P5: Production Rollout

### P5-1: Real Device Validation

Owner: Team D

Acceptance:

- 8 hour Android test passes
- offline/reconnect/app-kill scenarios pass
- evidence is recorded

### P5-2: Operations Runbook

Owner: Team D with Team B and Team C

Acceptance:

- runbook covers stale agents, queue backlog, GPS-disabled, auth failures, stuck shifts, and escalation owners

### P5-3: Production Acceptance

Owner: all teams

Acceptance:

- all critical requirements in `REQUIREMENTS.md` pass
- all implementation decision-log entries are `completed` or have explicit partial cleanup
