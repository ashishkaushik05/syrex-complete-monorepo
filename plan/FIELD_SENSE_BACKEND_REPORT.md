# Field Sense Backend Report

## Backend Responsibility

The backend must become the reliable source of truth for Field Sense. It should accept offline-originated mobile events, de-duplicate retries, reconcile local mobile shifts with server shifts, persist raw location points, broadcast live updates only after persistence, and expose org-scoped read APIs for web.

Codex will own backend changes in the implementation phase.

## Current Backend State

Implemented today:

- `fieldShifts.start/end/extend/active/list`
- `fieldLocation.ingest/trail/agentTrail/activeAgents`
- `fieldVisits.log/list/forShift`
- `fieldStops.start/end/list/active`
- `fieldAttendance.mark/list/patch`
- `fieldSchedule.me/upsertMe/list/setForUser`
- SSE endpoint at `/field/live-stream`
- Prisma models for `Shift`, `FieldLocation`, `ShiftSchedule`, `FieldVisit`, `FieldStop`, `DailyAttendance`

Current limitation:

- Backend assumes server shift already exists and is active before location ingestion.
- Ingestion has no idempotency key.
- Duplicate batches create duplicate points.
- Late offline points can be rejected or accepted as zero.
- Batch response does not tell mobile what was accepted, duplicated, rejected, or retryable.
- Read routes need stricter org scoping.

## Required Backend Target State

### Data Model Changes

Add or equivalent:

```prisma
model Shift {
  clientShiftId String?
  syncState     String? // optional: server_created, client_synced, conflict
  clientStartedAt DateTime?
  clientEndedAt   DateTime?

  @@unique([orgId, agentId, clientShiftId])
}

model FieldLocation {
  clientPointId String?
  clientShiftId String?
  capturedAt    DateTime?
  source        String?
  platform      String?
  appVersion    String?
  altitude      Float?
  speed         Float?
  heading       Float?
  isMocked      Boolean?

  @@unique([orgId, agentId, clientPointId])
}
```

If nullable unique behavior is not portable enough, use a separate ingestion/event table or ensure generated migrations match the database engine behavior.

Optional but recommended:

```prisma
model FieldSyncStatus {
  id                 String   @id @default(uuid())
  orgId              String
  agentId            String
  deviceId           String
  shiftId            String?
  clientShiftId      String?
  appVersion         String?
  platform           String?
  lastCapturedAt     DateTime?
  lastReceivedAt     DateTime?
  pendingQueueDepth  Int?
  lastSyncErrorCode  String?
  permissionsSummary Json?
  updatedAt          DateTime @updatedAt

  @@unique([orgId, agentId, deviceId])
  @@index([orgId, updatedAt])
}
```

### New/Updated Routes

#### `fieldShifts.syncStart`

Input:

```ts
{
  clientShiftId: string
  startedAt: string
  timezone?: string
  deviceId?: string
  appVersion?: string
  platform?: 'android' | 'ios'
}
```

Behavior:

- Actor must have `field:write` and `isFieldEnabled`.
- Resolve org from actor/header/input using existing org rules.
- If `(orgId, agentId, clientShiftId)` exists, return it.
- If an active shift exists for agent, reconcile:
  - If it overlaps and has no clientShiftId, attach clientShiftId if safe.
  - Otherwise return conflict with explicit reason.
- Create shift if none exists.
- Upsert attendance idempotently.

Output:

```ts
{
  shift: Shift
  serverShiftId: string
  clientShiftId: string
  status: 'created' | 'existing' | 'reconciled'
}
```

#### `fieldShifts.syncEnd`

Input:

```ts
{
  clientShiftId: string
  endedAt: string
  deviceId?: string
}
```

Behavior:

- Resolve shift by `(orgId, agentId, clientShiftId)`.
- If already completed, return existing as acknowledged.
- If auto-closed, reconcile client end timestamp according to policy.
- Complete active shift idempotently.

#### `fieldLocation.ingestV2`

Input:

```ts
{
  clientShiftId: string
  shiftId?: string
  deviceId?: string
  points: Array<{
    clientPointId: string
    lat: number
    lng: number
    accuracy: number
    recordedAt: string
    capturedAt?: string
    altitude?: number
    speed?: number
    heading?: number
    source?: string
    isMocked?: boolean
    platform?: string
    appVersion?: string
  }>
}
```

Validation:

- `points.length`: 1 to 500.
- `lat`: -90 to 90.
- `lng`: -180 to 180.
- `accuracy`: finite, non-negative, configurable max.
- `recordedAt`: valid ISO datetime.
- Reject future timestamps beyond configured skew.

Behavior:

- Resolve shift by `shiftId` or `clientShiftId`.
- If no shift exists, return retryable `SHIFT_NOT_SYNCED` or create/reconcile if sync-start data is sufficient.
- Insert with duplicate skip using unique key.
- Broadcast last newly accepted or latest acknowledged point only after DB success.
- Return structured ack.

Output:

```ts
{
  serverShiftId: string
  clientShiftId: string
  accepted: string[]
  duplicates: string[]
  rejected: Array<{ clientPointId: string; reason: string }>
  retryable: boolean
}
```

### Read Route Hardening

Routes that must enforce org ownership:

- `fieldLocation.trail`
- `fieldLocation.agentTrail`
- `fieldLocation.activeAgents`
- `fieldVisits.list`
- `fieldVisits.forShift`
- `fieldStops.list`
- `fieldStops.active`
- `fieldShifts.list`
- `fieldAttendance.list`
- `fieldSchedule.list`

Rule:

- Default to `ctx.actor.orgId`.
- If input includes org/agent/shift ID, validate it belongs to actor org.
- Allow cross-org only for explicit super-admin/global policy.

## Backend Implementation Sequence

1. Create decision entry for backend implementation scope.
2. Add Prisma schema fields and migration.
3. Implement shared helpers:
   - field org resolver
   - shift ownership validator
   - coordinate validator
   - batch acknowledgement builder
4. Implement `fieldShifts.syncStart`.
5. Implement `fieldShifts.syncEnd`.
6. Implement `fieldLocation.ingestV2`.
7. Add org scoping to read routes.
8. Add tests.
9. Keep old `fieldLocation.ingest` as compatibility path until mobile migrates.
10. Mark old path for later deprecation after Sales Mobile App uses V2.

## Backend Test Plan

Minimum tests:

- `syncStart` creates shift.
- `syncStart` repeated with same `clientShiftId` returns existing shift.
- `syncStart` reconciles compatible active server shift.
- `syncEnd` is idempotent.
- `ingestV2` accepts valid batch.
- `ingestV2` repeated with same `clientPointId`s stores no duplicates.
- `ingestV2` rejects invalid lat/lng/accuracy with reason.
- `ingestV2` returns `SHIFT_NOT_SYNCED` for unknown `clientShiftId` if policy requires shift sync first.
- SSE broadcast occurs after persisted accepted point.
- Cross-org read is denied.
- Active agents returns latest persisted point.

## Backend Risks

- Existing mobile app uses `fieldLocation.ingest`; changing it directly could break current tracking. Use V2 first.
- Prisma unique constraints with nullable fields need careful migration design.
- Auto-start/auto-close reconciliation needs explicit business policy for overlapping shifts.
- Large trail reads may need pagination or derived summaries later.

## Backend Definition Of Done

- Migration applied and generated client updated.
- V2 routes implemented and typed.
- Old route remains functional.
- Tests pass for idempotency/offline/cross-org cases.
- Mobile agent has stable request/response contracts.
- Decision log updated as completed or partial with exact cleanup items.
