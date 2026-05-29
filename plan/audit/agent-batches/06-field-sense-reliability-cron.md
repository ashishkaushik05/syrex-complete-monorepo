# Batch 06 — Field Sense: Reliability, Cron Locking & Schedule Fixes

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

## Decision context
- **D-10:** Add a `CronLock` table with `@@unique([jobName, runKey])` to prevent double-processing. No external scheduler.
- **D-13:** Keep `@@unique([userId])` on `ShiftSchedule` — one schedule per user. No change.
- **M-02 dropped:** the proposed `@@unique([agentId, date, startType])` on `Shift` is **not done in this batch** — it would break legitimate workflows where an agent ends a shift and starts another in the same day. The combination of (a) `CronLock` preventing duplicate auto-starts within the same minute, and (b) the existing `@@unique([orgId, agentId, clientShiftId])` for client-driven creation, is sufficient. If a duplicate-shift bug surfaces later, revisit with a partial unique index in raw SQL (Prisma doesn't support partial uniques).

## Files you will touch
- `backend/src/cron/field-auto-start.ts`
- `backend/src/cron/field-auto-close.ts`
- `backend/src/trpc/routes/field-shifts.ts` (timezone validation + wire `resetIngestBucket` from Batch 05)
- `backend/src/trpc/routes/field-location.ts` — RDP fix only
- `schema.prisma` — add `CronLock` model only. **If Batch 08 already added it, skip this schema edit.** Coordinate via the decision-log.

## Do NOT touch
`field-visits.ts`, `field-stops.ts` — Batch 05. Service routes — Batch 04. Other schema changes — Batch 08.

---

## Issues to fix

### [C-16] Cron double-processing — `CronLock` table
**Files:** `schema.prisma` (only if Batch 08 hasn't added it), `backend/src/cron/field-auto-start.ts`, `backend/src/cron/field-auto-close.ts`

**Step 1 — schema:**
```prisma
model CronLock {
  id        String   @id @default(uuid())
  jobName   String
  runKey    String   // for daily jobs: "YYYY-MM-DD"; for per-minute jobs: "YYYY-MM-DDTHH:MM"
  lockedAt  DateTime @default(now())

  @@unique([jobName, runKey])
  @@index([lockedAt])
  @@map("cron_locks")
}
```

**Step 2 — helper (place in `backend/src/cron/cron-lock.ts`):**
```typescript
import { prisma } from "../infra/db/prisma";

export async function acquireLock(jobName: string, runKey: string): Promise<boolean> {
  try {
    await prisma.cronLock.create({ data: { jobName, runKey } });
    return true;
  } catch {
    return false; // P2002 unique violation = already held
  }
}

// Sweep locks older than 7 days. Call from a startup hook or a daily cron.
export async function sweepStaleLocks(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const res = await prisma.cronLock.deleteMany({ where: { lockedAt: { lt: cutoff } } });
  return res.count;
}
```

**Step 3 — usage:**
- `field-auto-close.ts` (daily): `runKey = new Date().toISOString().slice(0, 10)`.
- `field-auto-start.ts` (every minute): `runKey = new Date().toISOString().slice(0, 16)` (minute-resolution).
- Skip the run if `acquireLock` returns false.
- Remove the in-memory `isRunning` flag and all associated checks.
- Add a once-per-day call to `sweepStaleLocks()` (either as its own cron entry in `src/index.ts` or piggyback on `field-auto-close`).

### [M-03] Auto-close ignores disabled schedules
**File:** `backend/src/cron/field-auto-close.ts:49-79`

Add `isEnabled: true` to the `shiftSchedule.findMany` `where`:
```typescript
await prisma.shiftSchedule.findMany({ where: { ..., isEnabled: true } });
```
Apply the same to `field-auto-start.ts` if it queries `ShiftSchedule`.

### [M-01] RDP simplification — prevent stack overflow
**File:** `backend/src/trpc/routes/field-location.ts:55-75`

```typescript
function rdp(pts: Point[], epsilon: number): Point[] {
  if (pts.length > 50_000) {
    const step = Math.ceil(pts.length / 10_000);
    pts = pts.filter((_, i) => i % step === 0);
  }
  if (pts.length <= 2) return pts;
  // ... existing recursive body unchanged
}
```
Surgical guard only — do not rewrite the algorithm.

### [L-12] Timezone string validation
**File:** `backend/src/trpc/routes/field-shifts.ts` (wherever `ShiftSchedule` is upserted)

`Intl.DateTimeFormat(undefined, { timeZone: tz })` does not reliably throw across runtimes. Use the format step:
```typescript
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

if (input.timezone && !isValidTimezone(input.timezone)) {
  throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid timezone: ${input.timezone}` });
}
```

### [L-14] Extract duplicated date range filter
**Files:** `field-shifts.ts` (this batch); other files in their own batches.

Create `backend/src/trpc/routes/field-helpers.ts` (or extend `service-shared.ts` if that's the project's convention):
```typescript
export function buildDateRangeFilter(
  dateStr?: string,
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } | undefined {
  if (dateStr) {
    const start = new Date(dateStr);
    const end = new Date(dateStr);
    end.setDate(end.getDate() + 1);
    return { gte: start, lte: end };
  }
  if (from || to) {
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  return undefined;
}
```
Replace duplicated date logic in `field-shifts.ts` with calls to this helper. Batches 05 and the route-by-route audit will adopt it in their own files.

### Wire `resetIngestBucket` from Batch 05
**File:** `backend/src/trpc/routes/field-shifts.ts`

When a shift transitions to ended (manual end, auto-close, or status change to `ended`/`closed`), call `resetIngestBucket(agentId, shiftId)` from `field-location.ts` (export added in Batch 05). If Batch 05 has not landed yet, leave a `// TODO(batch-05): call resetIngestBucket here` comment at each end-shift site.

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] Running `field-auto-start` twice in the same minute does not create two shifts for the same agent
- [ ] Running `field-auto-close` with a disabled schedule does not close the shift
- [ ] `ShiftSchedule` upsert with `timezone: "Invalid/Zone"` returns `BAD_REQUEST`
- [ ] Location ingest of 60k GPS points does not throw a stack overflow
- [ ] `CronLock` table exists; `sweepStaleLocks()` deletes rows older than 7 days
- [ ] Regression tests cover the lock acquire/skip path and the disabled-schedule path
