# Backend Contracts

## Canonical Mobile Contracts

Production mobile tracking must use these backend routes.

| Purpose | Route | Permission | Notes |
| --- | --- | --- | --- |
| Start shift | `fieldShifts.syncStart` | `field:write` | Idempotent by `clientShiftId`; returns `serverShiftId`. |
| Upload points | `fieldLocation.ingestV2` | `field:write` | Accepts up to 500 points with `clientPointId`; returns accepted, duplicates, rejected, retryable. |
| End shift | `fieldShifts.syncEnd` | `field:write` | Completes shift by `clientShiftId`. |
| Health update | `fieldSyncStatus.upsert` | `field:write` | Stores queue, device, permission, and sync error state. |
| Active agents | `fieldLocation.activeAgents` | `field:read` | Returns `{ agents, hasMore }` and health fields. |
| Trail | `fieldLocation.trail` | `field:read` | Returns bounded and simplified path data. |

## Contract Details

### `fieldShifts.syncStart`

Input:

- `clientShiftId`
- `startedAt`
- optional `timezone`
- optional `deviceId`
- optional `appVersion`
- optional `platform`
- optional `orgId`

Output:

- `shift`
- `serverShiftId`
- `clientShiftId`
- `status`: `created`, `existing`, `reconciled`, or `completed`

Rules:

- must require Field enablement
- must require internal user
- must resolve org safely
- must reconcile an active shift only when safe
- must not create duplicate shifts for repeated `clientShiftId`

### `fieldLocation.ingestV2`

Input:

- `clientShiftId`
- optional `shiftId`
- optional `deviceId`
- `points`: 1 to 500 points

Point fields:

- `clientPointId`
- `lat`
- `lng`
- `accuracy`
- `recordedAt`
- optional `capturedAt`
- optional `altitude`
- optional `speed`
- optional `heading`
- optional `source`
- optional `isMocked`
- optional `platform`
- optional `appVersion`

Output:

- `serverShiftId`
- `clientShiftId`
- `accepted`
- `duplicates`
- `rejected`
- `retryable`

Rules:

- accepted ids may be removed from local pending queue
- duplicate ids may be marked acknowledged locally
- rejected ids must be retained with reason
- `retryable: true` means keep local data and retry after fixing shift sync
- invalid coordinates, accuracy, and future timestamps must reject per point

### `fieldShifts.syncEnd`

Input:

- `clientShiftId`
- `endedAt`
- optional `deviceId`
- optional `orgId`

Rules:

- idempotent completion by `clientShiftId`
- must not discard pending points
- mobile should preserve local end-pending state until backend ack

### `fieldSyncStatus.upsert`

Input:

- `deviceId`
- optional `shiftId`
- optional `clientShiftId`
- optional `appVersion`
- optional `platform`
- optional `lastCapturedAt`
- optional `lastSyncAttemptAt`
- optional `lastSyncErrorCode`
- optional `pendingQueueDepth`
- optional `permissionsSummary`
- optional `orgId`

Rules:

- health reporting must not block core shift lifecycle
- backend should store latest state by org, agent, and device
- supervisor dashboard should use this data for operational health

## Supervisor Read Contracts

### `fieldLocation.activeAgents`

Current output:

- `agents`
- `hasMore`

Each agent includes:

- `agentId`
- `agentName`
- `shiftId`
- `shiftStartedAt`
- `lastPingAt`
- `lat`
- `lng`
- `health`

Required extension:

- add or derive a deterministic `healthState`
- include enough timestamps and errors for web classification
- preserve `hasMore` and expose it visibly in web

### `fieldSyncStatus.list`

Use for operations dashboard and per-agent diagnostics.

Requirements:

- support agent filter
- support org scoping
- support bounded result size
- return latest devices by updated time

## Compatibility Routes

Legacy routes such as `fieldShifts.start`, `fieldShifts.end`, and
`fieldLocation.ingest` may remain only as compatibility/admin/manual flows.
They are not the production mobile tracking path.

Web REST compatibility shims that return empty data must be removed after all callers
use tRPC contracts directly.

## Backend Test Requirements

- Update stale auth mocks in Field ingestion tests to satisfy current `isActive` auth middleware.
- Test `syncStart` idempotency.
- Test `ingestV2` duplicate ack behavior.
- Test invalid point rejections.
- Test `retryable: true` for unknown shifts.
- Test org isolation for ingest, trails, active agents, schedule, visits, stops, and attendance.
- Test `activeAgents.hasMore`.
- Test health classification after it is introduced.

## Structured Logging Requirements

All sync-critical routes should log with:

- `requestId`
- `orgId`
- `agentId`
- `shiftId`
- `clientShiftId`
- `deviceId`
- `pointCount`
- `acceptedCount`
- `duplicateCount`
- `rejectedCount`
- `retryable`
- `durationMs`

Do not log raw full point payloads unless behind a dedicated diagnostic flag.
