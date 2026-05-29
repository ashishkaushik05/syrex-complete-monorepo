# Batch 05 — Field Sense: Security Fixes

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.
>
> **Run Batch 01 first** — this batch depends on the `x-actor-id` lockdown from Batch 01.

## Decision context
- **D-09:** Stay single-instance for SSE. Document the limitation; do not move to Redis in this batch.
- **Convention:** wildcard permission checks use `SUPER_ADMIN_PERMISSION` from `src/rbac/catalog.ts`.

## Files you will touch
- `backend/src/trpc/routes/field-location.ts`
- `backend/src/trpc/routes/field-visits.ts`
- `backend/src/trpc/routes/field-stops.ts`
- `backend/src/infra/sse.ts` (memory leak fix is in Batch 09; here, only if a helper signature must change)
- `backend/src/app.ts` — only the SSE route's wildcard-subscription guard (Batch 01 handles the upstream Bearer resolution)

## Do NOT touch
`field-shifts.ts` — Batch 06. `app.ts` middleware auth — Batch 01. Schema — Batch 08. Cron files — Batch 06.

---

## Issues to fix

### [C-11] SSE cross-org location broadcast
**File:** `backend/src/trpc/routes/field-location.ts:226-233` and any other broadcast site (also check `ingestV2` around line 477).

Both `ingest` and `ingestV2` currently broadcast a second time to whatever `x-org-id` the client sent. That header is attacker-controlled.

**Fix:**
- Delete the secondary broadcast block entirely.
- Broadcast only to `shift.orgId`.
- Search the file for any `c.req.header("x-org-id")` use in broadcast targeting and remove them. `shift.orgId` is the single source of truth.

### [C-12] Wildcard SSE subscription — restrict to super-admin
**File:** `backend/src/app.ts:89-94`

```typescript
import { SUPER_ADMIN_PERMISSION } from "./rbac/catalog";

const canAccessAllOrgs = perms.includes(SUPER_ADMIN_PERMISSION);
if (!requestedOrgId && !canAccessAllOrgs) {
  return c.json({ error: "x-org-id header required" }, 400);
}
```

Previously this also accepted `orgs:read` — drop that. `orgs:read` is for cross-org reads of org records, not for subscribing to live field data across orgs.

### [C-18] `field-visits.ts` — invalid orgId filter on Outlet/User lookup
**File:** `backend/src/trpc/routes/field-visits.ts:84-92`

`Outlet` and `User` have no `orgId` column. Yet `bun run typecheck` currently passes with `orgId: shift.orgId` on these `where` clauses — meaning Prisma is silently accepting the unknown key at runtime and the filter is a no-op.

**Step 1 — confirm the silent acceptance.** Add a temporary `console.log` at one of the lookups, run the route, and check whether the SQL emitted by Prisma includes `org_id`. If it does NOT, our hypothesis is right.

**Step 2 — fix:**
1. Remove `orgId: shift.orgId` from the `outlet.findFirst` call. After the fetch, assert org match using the canonical source. **After Batch 08:** `outlet.orgId`. **Before Batch 08:** load `outlet.warehouse.org.id` via include and compare.
2. Remove `orgId: shift.orgId` from the `user.findFirst` call. There is no User→Org direct relation. Scope is instead enforced indirectly: the customer User must own the Outlet, and the Outlet must match `shift.orgId` — which step 1 already guarantees. So after Batch 08:
   ```typescript
   const customer = await ctx.prisma.user.findFirst({
     where: { id: input.customerId, isActive: true, userType: "outlet" },
     select: { id: true },
   });
   if (!customer || customer.id !== outlet.userId) {
     throw apiError("BAD_REQUEST", "Customer does not belong to selected outlet");
   }
   ```
3. Run `bun run typecheck`. If Prisma's strict types now reject what was previously accepted somewhere else, address those compile errors too — they were all the same silent-accept bug.

### [H-11] Shift ownership not verified for stops and visits
**Files:** `backend/src/trpc/routes/field-stops.ts:75-79`, `backend/src/trpc/routes/field-visits.ts:77-81`

```typescript
if (input.agentId !== ctx.actor.id) {
  throw new TRPCError({ code: "FORBIDDEN", message: "Cannot create records on another agent's shift" });
}
```
Place this BEFORE the shift lookup in each procedure.

### [M-05] `audioUrl` must be HTTPS only
**File:** `backend/src/trpc/routes/field-visits.ts:65`

```typescript
audioUrl: z.string().url().refine(
  (u) => u.startsWith("https://"),
  { message: "audioUrl must use HTTPS" },
).optional(),
```

### [M-06] `activeAgents` — deactivated users appearing as active
**File:** `backend/src/trpc/routes/field-location.ts:672-684`

Add `agent: { isActive: true }` to the shift `where`:
```typescript
where: { status: "active", orgId: resolvedOrgId, agent: { isActive: true } }
```

### [L-13] `activeAgents` — no pagination
**File:** `backend/src/trpc/routes/field-location.ts:669-770`

Add `limit: z.number().int().min(1).max(200).default(100)` to the input schema. Apply `take: input.limit`. Return `{ agents, hasMore: agents.length === input.limit }`.

### [M-04] Location ingest rate limiting
**File:** `backend/src/trpc/routes/field-location.ts:188,244`

- In-memory sliding-window limiter (same pattern as Batch 01).
- Key by `${agentId}:${shiftId}`. Cap: 2000 points per minute.
- On exceed: throw `TOO_MANY_REQUESTS`.
- Sweep stale entries every 5 min.
- **Reset bucket on shift end** — wire a `resetIngestBucket(agentId, shiftId)` helper and call it from `field-shifts.ts` end-shift mutations. (You may not edit `field-shifts.ts` here — Batch 06 owns it. Export the helper from `field-location.ts` and add a note in `06-field-sense-reliability-cron.md`'s file list so Batch 06 wires the call.)

---

## Coordination
- Batch 01 owns `x-actor-id` removal in `app.ts`. Run 01 first; this batch only touches the SSE wildcard-subscription guard.
- Batch 09 owns the SSE memory-leak fix in `sse.ts`. Do not touch `sse.ts` here.
- Batch 06 must call `resetIngestBucket` from `field-shifts.ts` end-of-shift handlers — leave a TODO there if Batch 06 has not run yet.

## Validation checklist
- [ ] `bun run typecheck` passes with zero errors
- [ ] Sending an ingest with `x-org-id: <other-org>` does NOT broadcast to that org's SSE subscribers
- [ ] SSE wildcard subscription by a non-super-admin (even with `orgs:read`) returns 403
- [ ] Creating a visit with `agentId: <other-agent-uuid>` returns `FORBIDDEN`
- [ ] `audioUrl: "file:///etc/passwd"` is rejected at input validation
- [ ] `activeAgents` does not include shifts of deactivated users
- [ ] `activeAgents` returns at most `limit` results and reports `hasMore`
- [ ] Ingesting 3000 points in one minute for the same shift returns `TOO_MANY_REQUESTS` on the request that crosses 2000
- [ ] Regression tests cover C-11, C-12, C-18, H-11
