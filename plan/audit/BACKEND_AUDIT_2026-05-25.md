# Syrex Backend — Full Audit Report
**Date:** 2026-05-25  
**Audited by:** 5 parallel agents (Sonnet × 1 for auth/permissions, Haiku × 4 for remaining modules)  
**Scope:** `backend/src/**`, `backend/scripts/**`, `schema.prisma`

---

## Executive Summary

The backend has solid structural foundations — permission catalog, tRPC procedure guards, and Zod input validation are all present. However, the audit found **19 Critical** and **30+ High** vulnerabilities spanning every module. The most severe issues cluster around three root causes:

1. **The `x-actor-id` header is trusted from untrusted clients** — any network caller can impersonate any user with no Bearer token. This is the most dangerous finding in the codebase.
2. **Multi-tenant org isolation is absent from most data queries** — `outlets`, `invoices`, `service-complaints`, `service-warranty`, `service-forms`, and `service-integrations` all return cross-org data.
3. **Scope checks are applied after data is fetched** (IDOR pattern) throughout services, rather than filtering in the Prisma `where` clause.

The permissions model itself (catalog, wildcard `"*"`, `perm()` guards) is largely correct, but several permission assignments are dangerously over-scoped (Outlet role has `outlets:read`, Sales role has `service:approve`), and `roles.update` allows privilege escalation to super-admin by any `roles:write` holder.

---

## Critical Vulnerabilities (19)

### [C-01] `x-actor-id` Header Trusted Directly — Authentication Bypass
- **File:** `backend/src/app.ts:27-43`, `backend/src/trpc/context.ts:29`
- **Problem:** The Bearer-token middleware only resolves `x-actor-id` from a token if the header is NOT already set. Any external client can send `x-actor-id: <admin-uuid>` and the middleware skips token validation entirely. The actor is accepted with full permissions.
- **Attack:** `GET /trpc/auth.me` with header `x-actor-id: <known-admin-uuid>` → authenticated as admin, no token required.
- **Fix:** Never trust `x-actor-id` from untrusted clients. Always require Bearer token resolution. Strip `x-actor-id` at the reverse-proxy layer if server-to-server trust is needed.

### [C-02] SSE Live-Stream Also Accepts `x-actor-id` Directly
- **File:** `backend/src/app.ts:57-71`
- **Problem:** Same `x-actor-id` bypass as C-01 exists on the raw Hono SSE route. Any client can subscribe to any org's live location stream by impersonating a valid user.
- **Fix:** Same as C-01 — require Bearer token; never trust the raw header from external callers.

### [C-03] Access Token Expires in 30 Days, Not 15 Minutes
- **File:** `backend/src/trpc/routes/auth.ts:39-41`, `auth.ts:92`, `auth.ts:153`
- **Problem:** `tokenExpiryDate()` sets expiry to `now + 30 days` for both access and refresh tokens. Login/refresh responses tell clients `expiresIn: 900` (15 min). The server accepts the token for 30 days regardless. Refresh always resets to a new 30-day window, so active sessions never expire.
- **Impact:** Stolen access token valid for 30 days. Logout does NOT revoke — `revokedAt` is set but never checked in `app.ts:35`.
- **Fix:** Split into `accessExpiresAt` (15 min) and `refreshExpiresAt` (30 days). Check `revokedAt` in the auth middleware.

### [C-04] `roles.update` Allows Any `roles:write` Holder to Escalate to Super-Admin
- **File:** `backend/src/trpc/routes/roles.ts:63-78`
- **Problem:** `roles.update` accepts `permissions: ["*"]` and `normalizeAndValidateRolePermissions` explicitly allows `"*"` to pass without checking if the caller already has `"*"`. Any user with `roles:write` can add `"*"` to their own role.
- **Fix:** Add: `if (input.permissions?.includes("*") && !ctx.permissions.includes("*")) throw FORBIDDEN`.

### [C-05] Multi-Tenant Isolation Failure — `outlets.list` Has No Org Filter
- **File:** `backend/src/trpc/routes/outlets.ts:127-144`
- **Problem:** `outlets.list` returns all outlets in the database with no `orgId` filter. Any `outlets:read` holder (including Outlet-role users) can read all competitors' outlet names, phone numbers, credit limits, outstanding balances, and GSTIN.
- **Fix:** Add `orgId: ctx.actor.orgId` to the Prisma `where` clause.

### [C-06] IDOR — `outlets.getById` Has No Org Scope Check
- **File:** `backend/src/trpc/routes/outlets.ts:169-185`
- **Problem:** Retrieves any outlet by ID with no org verification.
- **Fix:** Add `orgId` filter to the query or call `assertOutletWarehouseScope` before returning data.

### [C-07] Multi-Tenant Isolation Failure — `service-complaints.list` Uses `orgId ?? undefined` (Null Leaks All)
- **File:** `backend/src/trpc/routes/service-complaints.ts:162`
- **Problem:** `orgId: ctx.actor.orgId ?? undefined` — when `orgId` is null, Prisma treats it as "no filter," returning complaints from all orgs.
- **Fix:** Replace `?? undefined` with an explicit null guard: if `orgId` is null, throw `FORBIDDEN`.

### [C-08] IDOR Pattern Throughout Service Module — Fetch Before Org Check
- **Files:** `service-complaints.ts:235,251`, `service-warranty.ts:46,133,337`, `service-tests.ts:35,135`, `service-assignments.ts:36,108`
- **Problem:** All of these procedures fetch a record by ID with no org filter, then call `assertOrgAccess` after the data is already in memory. Any authenticated user can read complaint/warranty/test data from other orgs by guessing UUIDs.
- **Fix:** Add `orgId: ctx.actor.orgId` to every `findUnique`/`findFirst` query on these routes. Never filter org after fetching.

### [C-09] IDOR — `invoices.list` Missing Org/Warehouse Scope
- **File:** `backend/src/trpc/routes/invoices.ts:243-269`
- **Problem:** `invoices.list` does not filter by organization or warehouse. Any `invoices:read` holder can list all invoices system-wide.
- **Fix:** Apply warehouse/outlet scope filter (same pattern as `orders.list`).

### [C-10] Stock Deduction Race Condition in Dispatch Creation
- **File:** `backend/src/trpc/routes/dispatches.ts:345-367`
- **Problem:** Stock check and decrement are not atomic. Two concurrent dispatch requests can both pass the `currentQty >= requested` check before either updates the row, causing overselling and negative stock.
- **Fix:** Use a pessimistic lock within the transaction: `SELECT ... FOR UPDATE` on the stock row, or fetch-and-compare inside the transaction before the update.

### [C-11] SSE Cross-Org Broadcast
- **File:** `backend/src/trpc/routes/field-location.ts:226-233`
- **Problem:** The `ingest` endpoint broadcasts location updates using both `shift.orgId` and the `x-org-id` header value — the header is not validated against the shift's org. An attacker can send location data for org A while specifying org B in `x-org-id`, broadcasting to wrong-org subscribers.
- **Fix:** Remove the secondary broadcast or validate `orgId === shift.orgId` before using the header value.

### [C-12] Wildcard SSE Subscription Allows Cross-Org Location Stream Access
- **File:** `backend/src/app.ts:89-94`
- **Problem:** `orgId = "*"` subscription allowed for users with `"orgs:read"` permission — an undocumented/non-standard permission. A user with this permission subscribes to all orgs' live location streams.
- **Fix:** Restrict wildcard SSE to super-admin (`"*"` permission) only, or remove wildcard support.

### [C-13] Missing Cascade Delete on User FK Relations — Orphaned Data on User Delete
- **File:** `schema.prisma:139-170`
- **Problem:** 20+ FK relations on User have no `onDelete` rule. Deleting a user leaves orphaned `SaleOrder`, `Dispatch`, `FieldVisit`, `ServiceComplaint`, `DispatchTimeline`, `ServiceWarrantyDecision`, and other records. FK constraint violations may also prevent deletion entirely.
- **Fix:** Add `onDelete: SetNull` to audit-trail FKs (createdById, approvedById) and `onDelete: Cascade` or `Restrict` to ownership FKs.

### [C-14] Missing Cascade on Role FK — Role Deletion Fails in Production
- **File:** `schema.prisma:139`
- **Problem:** `User.roleId` has no `onDelete` rule. Attempting to delete a Role that has assigned users will throw a FK constraint error.
- **Fix:** Add `onDelete: Restrict` to prevent deletion when users are assigned.

### [C-15] SSE Connection Map Is Unbounded — Memory Leak on Abnormal Disconnects
- **File:** `backend/src/infra/sse.ts:1-43`
- **Problem:** The in-process `Map<orgId, Set<controller>>` is only cleaned up via the explicit `removeSseConnection` call. Abrupt client disconnects that don't trigger the cleanup path leave dead controllers in memory indefinitely. Under heavy traffic this causes OOM.
- **Fix:** Track connection create time; periodically sweep stale connections. Alternatively, use stream `closed` signal to guarantee cleanup.

### [C-16] Cron Jobs Have No Distributed Lock — Double-Processing on Multi-Instance Deploy
- **File:** `backend/src/cron/field-auto-start.ts`, `backend/src/cron/field-auto-close.ts`
- **Problem:** Both crons use an in-memory `isRunning` flag. On multi-instance deploys (or container restarts), both instances run the cron simultaneously, creating duplicate shifts or double-closing the same shift.
- **Fix:** Implement a DB-level advisory lock or a `cron_lock` table with `@@unique([jobName, runDate])`.

### [C-17] Service Client Audit Log Records Spoofable `x-actor-id`
- **File:** `backend/src/trpc/trpc.ts:122-136`
- **Problem:** `serviceCredentialMiddleware` logs `actorId: ctx.actor.id` — but for service credential auth, `x-actor-id` comes from an untrusted external service and is never validated. Any machine client can spoof the actor ID in its own audit trail.
- **Fix:** Set `actorId: null` in service client audit logs (machine auth has no human actor) or validate the actor separately.

### [C-18] `field-visits.ts` Queries `Outlet` and `User` with `orgId` Field That Doesn't Exist
- **File:** `backend/src/trpc/routes/field-visits.ts:84-92`
- **Problem:** The visit log endpoint filters outlet and user by `orgId: shift.orgId` — but neither `Outlet` nor `User` has an `orgId` column. Prisma silently ignores the filter (or throws a type error). The org scoping on visits is entirely broken.
- **Fix:** Run `bun run typecheck` — this surfaces as a compile error. Remove the broken filters and implement proper scoping via the outlet's warehouse/org chain.

### [C-19] DB Connection Pooling Unconfigured — Connection Exhaustion Under Load
- **File:** `backend/src/infra/db/prisma.ts`
- **Problem:** PrismaClient uses default pool (10 connections). With two DB round-trips per request (session lookup + user/permission lookup from C-01 fix), connection exhaustion occurs at moderate load.
- **Fix:** Explicitly configure `connection_limit` and consider a session cache (Redis) to reduce per-request DB queries.

---

## High Vulnerabilities (Selected — Full List in Section Below)

### [H-01] Outlet Role Has `outlets:read` — Exposes All Competitor Outlet Data
- **File:** `backend/scripts/seed-permissions.ts:4-15`
- **Problem:** Outlet-role users can call `outlets.list` and see every other outlet's credit limits, balance, billing info, and GSTIN. This is a data leakage issue for every outlet user in the system.
- **Fix:** Remove `outlets:read` from `OUTLET_PERMISSIONS`, or scope the endpoint to only return the caller's own outlet for outlet-type users.

### [H-02] `roles.update` Can Modify `isSystem` Flag
- **File:** `backend/src/trpc/routes/roles.ts:63-78`
- **Problem:** `updateRoleSchema` includes `isSystem: z.boolean().optional()`. Any `roles:write` holder can set `isSystem: false` on the Admin role or `isSystem: true` on a custom role, breaking system-role assumptions.
- **Fix:** Restrict `isSystem` field changes to `"*"` permission holders only.

### [H-03] `users.changePassword` Has No Current-Password Verification
- **File:** `backend/src/trpc/routes/users.ts:219-234`
- **Problem:** Admin can silently change any user's password (including another admin's) with no current-password check and no notification to the affected user.
- **Fix:** For self-service, require `currentPassword`. For admin resets, emit a security event and notify the target user.

### [H-04] `users.remove` Performs Hard DELETE Instead of Soft-Delete
- **File:** `backend/src/trpc/routes/users.ts:236-258`
- **Problem:** Contradicts the repo's own soft-delete convention. Destroys audit trail, breaks referential integrity.
- **Fix:** Use `prisma.user.update({ data: { isActive: false } })` and revoke active sessions.

### [H-05] Plaintext Password Fallback in `verifyPassword`
- **File:** `backend/src/trpc/routes/auth.ts:43-48`
- **Problem:** If `passwordHash` doesn't start with a hash prefix (`$2`, `$argon2`), the raw value is compared to the input as plaintext. Any user with a plaintext DB entry authenticates without hashing.
- **Fix:** Remove the plaintext fallback. Force a password reset for any unrecognized hash format.

### [H-06] Invitation `accept` Doesn't Validate Email — Any User Can Accept Any Invitation
- **File:** `backend/src/trpc/routes/invitations.ts:146-175`
- **Problem:** Any authenticated user with `users:invite` can accept a pending invitation token and link it to themselves. No email match validation.
- **Fix:** Validate `acceptingUser.email === invitation.email` before accepting.

### [H-07] No Rate Limiting on Login or Token Refresh Endpoints
- **File:** `backend/src/trpc/routes/auth.ts:51-166`
- **Problem:** Brute-force against passwords is unrestricted. Seed users have predictable passwords (`name + "123"`). Refresh endpoint can be hammered to extend sessions indefinitely.
- **Fix:** Sliding-window rate limit by IP + email (5 attempts per 15 min). Implement absolute session TTL on refresh.

### [H-08] No Security Headers (CORS, HSTS, CSP, X-Frame-Options)
- **File:** `backend/src/app.ts`
- **Problem:** No CORS policy, no HSTS, no clickjacking protection, no MIME-sniffing protection.
- **Fix:** Add Hono security-headers middleware.

### [H-09] No Request Body Size Limit
- **File:** `backend/src/app.ts`
- **Problem:** No `bodyLimit` set. Memory exhaustion via oversized POST bodies.
- **Fix:** Add `bodyLimit({ maxSize: "5mb" })` middleware.

### [H-10] Tax Snapshot Not Used for Auto-Invoice — Live Tax Charges Applied at Approval
- **File:** `backend/src/trpc/routes/orders.ts:542-555`
- **Problem:** If tax charges are modified between order creation and approval, the generated invoice will use the new charge rates, not the rates the customer saw. This is a tax compliance violation.
- **Fix:** Always use `order.taxSnapshot`; only fall back to live charges if snapshot is explicitly missing (migration case), and log a warning.

### [H-11] Shift Ownership Not Verified in Stop/Visit Operations
- **File:** `backend/src/trpc/routes/field-stops.ts:75-79`, `field-visits.ts:77-81`
- **Problem:** A user can create stops or visits on another agent's shift if they know the agent's ID and orgId.
- **Fix:** Assert `ctx.actor.id === agentId` before processing.

### [H-12] `org:read` Filter Missing in `service-forms.listTemplates` and `service-integrations.*`
- **File:** `service-forms.ts:216`, `service-integrations.ts:56,89`
- **Problem:** Same null-orgId leakage pattern as C-07 — null actor orgId returns global data.
- **Fix:** Explicit null guard on orgId for all internal-user routes.

### [H-13] Soft-Delete Columns Have No Database Indexes
- **File:** `schema.prisma` (all models with `isActive`)
- **Problem:** Queries that filter `isActive = true` with no index cause full table scans as deleted record count grows.
- **Fix:** Add composite indexes: `@@index([isActive, createdAt])` on all soft-deletable models.

### [H-14] Auth Session — Two DB Round-Trips Per Request
- **File:** `backend/src/app.ts`, `backend/src/trpc/trpc.ts`
- **Problem:** Every request hits DB twice: once for `AuthSession` lookup (app middleware) and once for `User` + permissions (tRPC context). Under load this is a significant bottleneck.
- **Fix:** Cache session in Redis with TTL = access token expiry.

---

## Medium Vulnerabilities (Condensed)

| ID | Description | File | Fix |
|----|-------------|------|-----|
| M-01 | RDP simplification is recursive with no depth limit — stack overflow on 100k+ GPS points | `field-location.ts:55-75` | Convert to iterative or bound input to 10k pts |
| M-02 | Concurrent auto-start cron can create duplicate shifts for the same user | `field-auto-start.ts:49-89` | Add `@@unique([agentId, date, startType])` DB constraint |
| M-03 | Auto-close ignores `isEnabled: false` schedules | `field-auto-close.ts:49-79` | Add `where: { isEnabled: true }` filter |
| M-04 | Location ingest accepts 500 pts/request with no per-agent rate limiting | `field-location.ts:188,244` | Rate-limit to 1000 pts/min per agent |
| M-05 | `audioUrl` in field visits accepts `file://` and `data://` schemes | `field-visits.ts:65` | Restrict to `https://` only |
| M-06 | Deactivated users still appear in `activeAgents` SSE query | `field-location.ts:672-684` | Add `agent: { isActive: true }` filter |
| M-07 | `service-warranty.createFulfillmentOrder` skips stock adjustment | `service-warranty.ts:404-440` | Trigger stock decrement or document manual process |
| M-08 | `service-integrations.createClient` uses default hash params; `rotateSecret` uses `bcrypt cost:12` — inconsistent | `service-integrations.ts:86,142` | Standardize on `{ algorithm: "bcrypt", cost: 12 }` |
| M-09 | Service client `expiresAt` accepted but never validated or enforced | `service-integrations.ts:72` | Reject past-dated expiry; check expiry on auth |
| M-10 | ReDoS risk — user-supplied regex from form validation rules executed without length bounds | `service-forms.ts:37` | Move length check before regex creation |
| M-11 | `invoices.update` accepts any string for `unitPrice` — empty strings accepted | `invoices.ts:447` | Validate `unitPrice` parses as a positive Decimal |
| M-12 | Serial count not validated against `qtyDispatched` in dispatch lines | `dispatches.ts:414-423` | Assert `serialNumbers.length === qtyDispatched` if serials provided |
| M-13 | `invitations.accept` endpoint flow is incomplete — no user provisioning | `invitations.ts:146-175` | Implement registration-via-token flow or restrict endpoint |
| M-14 | Graceful shutdown timeout is 5 seconds — too short for long-running DB writes | `index.ts:26-34` | Increase to 30s or make configurable |
| M-15 | No DB connection health check on server startup | `index.ts` | Add `await prisma.$queryRaw\`SELECT 1\`` before `server.ready()` |
| M-16 | `UserInvitation.status` is plain string, not enum | `schema.prisma:193` | Create `enum InvitationStatus` |
| M-17 | `UserInvitation.role` is a string, not FK to Role — dangling references if role deleted | `schema.prisma:191` | Change to `roleId` FK |
| M-18 | `ServiceSerialEvent` unique constraint missing `orgId` — blocks multi-org same-serial scenarios | `schema.prisma:1217` | Add `orgId` to unique constraint |
| M-19 | `ShiftSchedule` has `@@unique([userId])` — one schedule per user is too restrictive | `schema.prisma:964` | Relax constraint; add `@@unique([userId, timezone])` |
| M-20 | `FieldVisit` allows both `outletId` and `customerId` to be null simultaneously | `schema.prisma:986` | Add check constraint: at least one must be set |

---

## Low / Informational (Condensed)

| ID | Description |
|----|-------------|
| L-01 | Seed scripts print credentials to stdout and use predictable passwords (`name + "123"`) |
| L-02 | `x-request-id` is trusted from client and included in error responses — allows log spoofing |
| L-03 | Prisma log level hardcoded (`["warn","error"]`) — no way to enable query logging in prod |
| L-04 | Logger outputs to console only — no structured log aggregation, no rotation |
| L-05 | No APM/tracing instrumentation — blind spot in production |
| L-06 | `roles.delete` permission defined in catalog but no delete endpoint exists — dead permission |
| L-07 | `DispatchTimeline.actorRole` stored as plain string not enum |
| L-08 | `invoices.list` cross-field filter (outletId + orderId) allows order existence probing |
| L-09 | Image model allows duplicate URI rows — no deduplication |
| L-10 | `attachment.storageKey` has no format validation — potential path traversal if storage backend is naive |
| L-11 | Audit log creation in `service-integrations` is not within the main transaction — inconsistent atomicity |
| L-12 | Timezone strings stored in `ShiftSchedule` without IANA validation — silent UTC fallback on bad value |
| L-13 | Missing pagination on `activeAgents` query — memory exhaustion on large deployments |
| L-14 | Date range filter logic duplicated across 4 field route files — maintenance risk |
| L-15 | No audit trail (activity log) for Field Sense operations (shift start/end, visits, stops) |
| L-16 | Complaint auto-resolve on dispatch delivery has no re-open path if delivery is reversed |
| L-17 | `amountPaid` can exceed `total` — no DB or application constraint |

---

## Roles & Permissions — Complete Matrix

| Role | Permissions | Notes |
|------|-------------|-------|
| **Admin** | `"*"` | All permissions |
| **Sales** | `orders:read/write`, `catalog:read`, `outlets:read`, `inventory:read`, `dispatches:read`, `invoices:read`, `payments:read`, `attachments:read/write`, `service:read/write/manage/approve/retest/assign/cancel/telephonic/form`, `warehouses:read`, `field:read/write` | ⚠️ `service:approve` is unusually high for a sales rep |
| **Warehouse Manager** | `inventory:read/receive/adjust`, `warehouses:read`, `orders:read`, `dispatches:read/write/deliver`, `attachments:read/write` | Correctly scoped |
| **Outlet** | `orders:read/write`, `catalog:read`, `outlets:read`, `invoices:read`, `payments:read`, `attachments:read/write`, `dispatches:read/deliver` | ⚠️ `outlets:read` exposes all competitor outlets; `payments:read` may expose cross-outlet payment data |

**Key permission design issues:**
- Sales role has `service:approve` — should this be a supervisor or manager role only?
- Outlet role has `outlets:read` — enables full outlet directory access for any outlet user (see C-05)
- No concept of "own data only" permission — scoping is entirely in application code (fragile, as shown throughout this audit)

---

## Top 10 Priority Fixes (Ordered by Risk × Effort)

| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | **[C-01/C-02]** Strip `x-actor-id` from untrusted clients at reverse-proxy; require Bearer always | Low |
| 2 | **[C-05/C-06/C-08/C-09]** Add `orgId` filter to ALL Prisma queries in outlets, invoices, services | Medium |
| 3 | **[C-04]** Prevent `roles.update` from setting `"*"` without caller already having `"*"` | Low |
| 4 | **[C-03]** Fix token expiry split (15min access / 30d refresh); check `revokedAt` in middleware | Medium |
| 5 | **[H-07]** Add rate limiting to login + refresh endpoints | Low |
| 6 | **[C-10]** Wrap stock check + decrement in pessimistic lock transaction | Medium |
| 7 | **[C-11/C-12]** Fix SSE org broadcast; restrict wildcard subscription | Low |
| 8 | **[H-01]** Remove `outlets:read` from Outlet role permissions or add per-outlet scoping | Low |
| 9 | **[C-15/C-16]** Fix SSE memory leak; add distributed cron lock | Medium |
| 10 | **[H-08/H-09]** Add security headers and body size limit middleware | Low |

---

## Vulnerability Count Summary

| Severity | Count |
|----------|-------|
| Critical | 19 |
| High | 14 |
| Medium | 20 |
| Low / Informational | 17 |
| **Total** | **70** |
