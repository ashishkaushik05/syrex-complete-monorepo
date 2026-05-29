# Field Sense Requirements

## Objective

Field Sense must support enterprise field operations where agents can work offline,
supervisors can monitor live operations, and backend sync remains idempotent,
auditable, and org-isolated.

## Functional Requirements

### Mobile Agent Runtime

- A Field-enabled sales agent can start a shift from the sales mobile Field tab.
- The Field tab is visible only when the authenticated user has `isFieldEnabled = true`
  and the required Field permissions.
- Direct Field routes are blocked when the user is not Field-enabled.
- Shift start creates a durable `clientShiftId` locally before backend sync.
- GPS capture starts after local shift activation and permission checks.
- Every captured point gets a stable `clientPointId`.
- Every point is written to local persistence before any network upload attempt.
- Shift end is recorded locally first and syncs with `fieldShifts.syncEnd`.
- Visits, stops, and attendance must either be local-first or clearly marked as
  online-only until their offline event sync is implemented.
- App restart restores active shift state, queued points, pending end state, and
  sync worker state.

### Backend Sync

- Backend accepts idempotent mobile shift starts through `fieldShifts.syncStart`.
- Backend accepts idempotent point ingestion through `fieldLocation.ingestV2`.
- Backend completes mobile shifts through `fieldShifts.syncEnd`.
- Backend records sync health through `fieldSyncStatus.upsert`.
- Backend rejects invalid points with per-point reasons.
- Backend treats duplicate `clientPointId` uploads as acknowledged duplicates.
- Backend enforces Field enablement and internal-user restrictions.
- Backend enforces org isolation on reads, writes, SSE, trails, schedules, stops,
  visits, attendance, and health status.

### Supervisor Dashboard

- Supervisors can view live active agents on a map.
- Live map must surface when `activeAgents.hasMore` is true.
- Supervisors can see agent sync health: queue size, last sync, last capture,
  last received location, permission state, device/platform/app version, and errors.
- Supervisors can distinguish active, delayed, stale, offline, GPS-disabled, and
  shift-desynced agents.
- Schedules, attendance, visits, stops, and shifts must support pagination or an
  explicit capped-data warning.
- Cross-user schedule and attendance actions must require `field:admin`.

### Operations And Monitoring

- Sync latency, ingestion latency, retry counts, rejected points, dropped points,
  queue depth, and SSE connection health must be observable.
- Backend logs must include correlation identifiers for Field sync paths:
  `requestId`, `orgId`, `agentId`, `shiftId`, `clientShiftId`, `deviceId`, and
  point batch counts where available.
- Alerts must exist for stale agents, high queue backlog, repeated sync failures,
  SSE stream failure, and ingestion error spikes.

## Non-Functional Requirements

### Reliability

- Mobile must preserve points across app kill, process death, phone restart, token
  expiry, network loss, and backend 5xx responses.
- A point must not be deleted from local storage until the backend acknowledges it as
  accepted, duplicate, or explicitly rejected.
- Rejected points must be retained with reason for diagnostics unless a documented
  retention cleanup policy removes them.
- Sync must use bounded batch sizes accepted by the backend, currently up to 500 points.

### Performance

- Location persistence must not block the UI thread.
- The sync worker must avoid unbounded memory growth.
- Live map rendering must stay usable with maximum active-agent page sizes.
- Backend active-agent and trail queries must remain indexed and bounded.

### Privacy And Security

- Field Sense is available only to internal users with Field enablement.
- Supervisors can view other users only with `field:admin` or equivalent super-admin.
- Ordinary sales agents must not receive `field:admin`.
- SSE authentication must expire safely and reconnect through the normal auth flow.
- Cross-org reads or wildcard subscriptions must be restricted to authorized admins.
- Location data must be treated as sensitive operational data.

### Platform

- Android must support foreground service location capture.
- Android battery optimization state must be visible to user and supervisor health.
- iOS must include required background location declarations before release.
- Release validation must run on physical devices, not only emulators.

## Permission Requirements

| Actor | Account Flag | Permissions | Expected Access |
| --- | --- | --- | --- |
| Sales agent | `isFieldEnabled=true` | `field:read`, `field:write` | Own shift, own location, own visits/stops, own attendance, own history. |
| Sales agent without Field Sense | `isFieldEnabled=false` | any | Field tab hidden and direct routes blocked. |
| Field supervisor | usually true | `field:read`, `field:write`, `field:admin` | View agents, manage schedules and cross-user attendance, inspect health. |
| Admin managing enablement | n/a | `users:field-enable` | Toggle Field Sense access for users. |
| Super admin | n/a | `*` | Cross-org diagnostics and wildcard operations where explicitly supported. |

## Acceptance Requirements

Field Sense cannot be marked complete until:

- offline shift start works
- offline shift end works
- captured points survive app/process death
- duplicate upload does not duplicate backend records
- backend retryable responses do not discard local data
- rejected points remain inspectable with reason
- queue depth appears in supervisor tooling
- stale/GPS-disabled/offline states appear in supervisor tooling
- direct Field navigation is blocked for unauthorized users
- old and new mobile production paths are not both active
- 8 hour Android device test passes with stable battery, memory, and sync behavior
- decision log entries are completed for each implementation slice
