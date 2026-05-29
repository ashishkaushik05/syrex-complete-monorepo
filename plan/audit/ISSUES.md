# Backend Issues Tracker
_Generated from audit 2026-05-25. Status: open / in-progress / done / wont-fix_

> See `agent-batches/00-README.md` for the execution DAG, conventions, and the issue → batch mapping for items resolved by removal/scoping.

---

## Critical

| ID | Status | File | Issue |
|----|--------|------|-------|
| C-01 | done | `backend/src/app.ts:27-43` | `x-actor-id` header trusted from untrusted clients — authentication bypass, no Bearer token required |
| C-02 | done | `backend/src/app.ts:57-71` | SSE live-stream same `x-actor-id` bypass as C-01 |
| C-03 | done | `backend/src/trpc/routes/auth.ts:39-41,92,153` | Access token expires in 30 days server-side but clients told 900s; `revokedAt` never checked on lookup |
| C-04 | done | `backend/src/trpc/routes/roles.ts:63-78` | Any `roles:write` holder can set `permissions: ["*"]` on their own role — privilege escalation to super-admin |
| C-05 | done | `backend/src/trpc/routes/outlets.ts:127-144` | `outlets.list` has no `orgId` filter — returns all orgs' outlets to any `outlets:read` holder |
| C-06 | done | `backend/src/trpc/routes/outlets.ts:169-185` | `outlets.getById` has no org scope check — IDOR |
| C-07 | done (Batch 04 / DEC-20260525-009) | `backend/src/trpc/routes/service-complaints.ts:162` | `orgId: ctx.actor.orgId ?? undefined` — null orgId returns all orgs' complaints |
| C-08 | done (Batch 04 / DEC-20260525-009) | `service-complaints.ts:235,251` / `service-warranty.ts:46,133,337` / `service-tests.ts:35,135` / `service-assignments.ts:36,108` | Records fetched by ID before org check — IDOR across all service routes |
| C-09 | done | `backend/src/trpc/routes/invoices.ts:243-269` | `invoices.list` missing org/warehouse scope — returns all invoices system-wide |
| C-10 | open | `backend/src/trpc/routes/dispatches.ts:345-367` | Stock check and decrement not atomic — race condition allows overselling / negative stock |
| C-11 | done (Batch 05) | `backend/src/trpc/routes/field-location.ts:226-233` | SSE location broadcast uses untrusted `x-org-id` header — cross-org data leak |
| C-12 | done (Batch 05) | `backend/src/app.ts:89-94` | Wildcard SSE subscription (`orgId = "*"`) allowed for `orgs:read` permission — too permissive |
| C-13 | open | `schema.prisma:139-170` | 20+ User FK relations have no `onDelete` rule — orphaned records or FK errors on user delete |
| C-14 | open | `schema.prisma:139` | `User.roleId` has no `onDelete` rule — role deletion throws FK constraint error in production |
| C-15 | open | `backend/src/infra/sse.ts:1-43` | In-process SSE connection Map unbounded — memory leak on abnormal client disconnects |
| C-16 | done (Batch 06 / DEC-20260525-014) | `backend/src/cron/field-auto-start.ts` / `field-auto-close.ts` | In-memory `isRunning` flag not process-safe — double-processing on multi-instance deploys |
| C-17 | done | `backend/src/trpc/trpc.ts:122-136` | Service client audit log records `ctx.actor.id` from spoofable `x-actor-id` header. Batch 01 sets `actorId: null` for machine-client calls. |
| C-18 | done (Batch 05) | `backend/src/trpc/routes/field-visits.ts:84-92` | `Outlet` and `User` queried with `orgId` filter but neither model has `orgId` column — scope silently broken |
| C-19 | open | `backend/src/infra/db/prisma.ts` | PrismaClient uses default connection pool (10) — connection exhaustion under moderate load |

---

## High

| ID | Status | File | Issue |
|----|--------|------|-------|
| H-01 | done | `backend/scripts/seed-permissions.ts:4-15` | Outlet role has `outlets:read`. Permission stays; Batch 03 enforces own-outlet-only scoping in `outlets.ts`. |
| H-02 | done | `backend/src/trpc/routes/roles.ts:63-78` | `roles.update` allows modifying `isSystem` flag on any role |
| H-03 | open | `backend/src/trpc/routes/users.ts:219-234` | `users.changePassword` has no current-password verification — admin can silently change any user's password |
| H-04 | open | `backend/src/trpc/routes/users.ts:236-258` | `users.remove` does hard `prisma.user.delete()` — violates repo soft-delete convention, destroys audit trail |
| H-05 | done | `backend/src/trpc/routes/auth.ts:43-48` | Plaintext password fallback in `verifyPassword` — any user with plaintext DB entry authenticates without hashing |
| H-06 | open → fixed by Batches 08+09 (removal) | `backend/src/trpc/routes/invitations.ts:146-175` | `invitations.accept` doesn't validate email match. Resolved by deleting the entire invitation flow (D-12). |
| H-07 | done | `backend/src/trpc/routes/auth.ts:51-166` | No rate limiting on login or token refresh endpoints — brute-force unrestricted |
| H-08 | open | `backend/src/app.ts` | No security headers (CORS, HSTS, CSP, X-Frame-Options, X-Content-Type-Options) |
| H-09 | open | `backend/src/app.ts` | No request body size limit — memory exhaustion via oversized POST |
| H-10 | open | `backend/src/trpc/routes/orders.ts:542-555` | Auto-invoice uses live tax charges instead of `order.taxSnapshot` — tax compliance violation |
| H-11 | done (Batch 05) | `backend/src/trpc/routes/field-stops.ts:75-79` / `field-visits.ts:77-81` | Shift ownership not verified — user can create stops/visits on another agent's shift |
| H-12 | done (Batch 04 / DEC-20260525-009) | `service-forms.ts:216` / `service-integrations.ts:56,89` | Same null-orgId pattern as C-07. Batch 04 applies the null guard everywhere. |
| H-13 | open | `schema.prisma` (all `isActive` columns) | Soft-delete columns have no database indexes — full table scans as deleted record count grows |
| H-14 | open | `backend/src/app.ts` / `backend/src/trpc/trpc.ts` | Two DB round-trips per request (session lookup + user/permissions) — no caching layer |

---

## Medium

| ID | Status | File | Issue |
|----|--------|------|-------|
| M-01 | done (Batch 06 / DEC-20260525-014) | `backend/src/trpc/routes/field-location.ts:55-75` | RDP simplification is recursive with no depth limit — stack overflow on 100k+ GPS points (DoS) |
| M-02 | wont-fix (replaced by C-16 CronLock) | `backend/src/cron/field-auto-start.ts:49-89` | The `@@unique([agentId, date, startType])` constraint would break legitimate same-day multi-shift workflows. Batch 06's `CronLock` (C-16) + existing `@@unique([orgId, agentId, clientShiftId])` are sufficient. Revisit if duplicate shifts surface in production. |
| M-03 | done (Batch 06 / DEC-20260525-014) | `backend/src/cron/field-auto-close.ts:49-79` | Auto-close ignores `isEnabled: false` schedules — unexpected shift closure |
| M-04 | done (Batch 05) | `backend/src/trpc/routes/field-location.ts:188,244` | Location ingest accepts 500 pts/request with no per-agent rate limit — storage DoS |
| M-05 | done (Batch 05) | `backend/src/trpc/routes/field-visits.ts:65` | `audioUrl` accepts `file://` and `data://` schemes — should be HTTPS only |
| M-06 | done (Batch 05) | `backend/src/trpc/routes/field-location.ts:672-684` | `activeAgents` query missing `agent: { isActive: true }` filter — deactivated users appear as active |
| M-07 | open | `backend/src/trpc/routes/service-warranty.ts:404-440` | `createFulfillmentOrder` creates replacement order but skips stock adjustment |
| M-08 | done | `backend/src/trpc/routes/service-integrations.ts:86,142` | `createClient` uses default hash params; `rotateSecret` uses `bcrypt cost:12` — inconsistent |
| M-09 | done (Batch 04 / DEC-20260525-009) | `backend/src/trpc/routes/service-integrations.ts:72` | `expiresAt` IS enforced at auth time (`trpc.ts:107-112`). Batch 04 added the missing creation-time validation. |
| M-10 | done (Batch 04 / DEC-20260525-009) | `backend/src/trpc/routes/service-forms.ts:37` | User-supplied regex from form validation rules executed before length check — ReDoS risk |
| M-11 | open | `backend/src/trpc/routes/invoices.ts:447` | `unitPrice` accepts any string — empty string or non-numeric values not rejected at input |
| M-12 | open | `backend/src/trpc/routes/dispatches.ts:414-423` | Serial count not validated against `qtyDispatched` — can dispatch 10 units with 5 serials |
| M-13 | open → fixed by Batches 08+09 (removal) | `backend/src/trpc/routes/invitations.ts:146-175` | Flow incomplete. Resolved by deleting the entire invitation flow (D-12). |
| M-14 | open | `backend/src/index.ts:26-34` | Graceful shutdown timeout is 5 seconds — too short for long-running DB writes |
| M-15 | open | `backend/src/index.ts` | No DB connection health check on startup — server reports ready before DB is reachable |
| M-16 | open → fixed by Batch 08 (removal) | `schema.prisma:193` | `UserInvitation.status` not an enum. Resolved by dropping the model. |
| M-17 | open → fixed by Batch 08 (removal) | `schema.prisma:191` | `UserInvitation.role` not an FK. Resolved by dropping the model. |
| M-18 | open | `schema.prisma:1217` | `ServiceSerialEvent` unique constraint missing `orgId` — blocks multi-org same-serial use |
| M-19 | open | `schema.prisma:964` | `ShiftSchedule @@unique([userId])` too restrictive — prevents multiple schedules per user |
| M-20 | open | `schema.prisma:986` | `FieldVisit.outletId` and `customerId` both nullable — orphaned visit records with no entity link possible |

---

## Low / Informational

| ID | Status | File | Issue |
|----|--------|------|-------|
| L-01 | open | `backend/scripts/dev-seed.ts:29-31` / `demo-seed.ts:51` | Seed scripts use predictable passwords (`name + "123"`) and print credentials to stdout |
| L-02 | open | `backend/src/trpc/context.ts:26` | `x-request-id` header trusted from client and included in error responses — log spoofing |
| L-03 | open | `backend/src/infra/db/prisma.ts` | Prisma log level hardcoded — cannot enable query logging in prod without code change |
| L-04 | open | `backend/src/infra/logger.ts` | Logger outputs to console only — no structured aggregation, no rotation |
| L-05 | open | (entire backend) | No APM/tracing instrumentation — no visibility into request latency or error rates in production |
| L-06 | done | `backend/src/trpc/routes/roles.ts` | `roles:delete` endpoint added in Batch 02. |
| L-07 | open | `backend/src/trpc/routes/dispatches.ts:442+` | `DispatchTimeline.actorRole` stored as plain string, not enum |
| L-08 | done | `backend/src/trpc/routes/invoices.ts:233-269` | Cross-field filter (`outletId` + `orderId`) allows probing order existence across outlets |
| L-09 | open | `schema.prisma:335-353` | Image model allows duplicate URI rows — no deduplication |
| L-10 | open | `schema.prisma:795` | `attachment.storageKey` has no format validation — potential path traversal |
| L-11 | open | `backend/src/trpc/routes/service-integrations.ts:153,194` | Audit log creation not inside main transaction — inconsistent atomicity |
| L-12 | done (Batch 06 / DEC-20260525-014) | `backend/src/trpc/routes/field-schedule.ts` | Timezone strings stored in `ShiftSchedule` without IANA validation — fixed at upsert via `isValidTimezone()` (`format()` step, not the unreliable constructor). |
| L-13 | done (Batch 05) | `backend/src/trpc/routes/field-location.ts:669-770` | `activeAgents` query has no pagination — memory exhaustion on large deployments |
| L-14 | partial (Batch 06 / DEC-20260525-014) | `field-shifts.ts` adopted; `field-stops.ts`, `field-visits.ts`, `field-location.ts` to adopt in their own batches | `buildDateRangeFilter` helper added in `field-helpers.ts`. `field-shifts.list` migrated. Remaining files left for route-by-route audit to avoid cross-batch touch. |
| L-15 | open | (all field routes) | No audit trail for Field Sense operations (shift start/end, visit creation, stops) |
| L-16 | open | `backend/src/trpc/routes/dispatches.ts:571-636` | Complaint auto-resolved on dispatch delivery with no re-open path if delivery is later reversed |
| L-17 | open | (invoices) | `amountPaid` can exceed `total` — no DB or application constraint |
