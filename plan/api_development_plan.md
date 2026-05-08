# API Development Plan

## Target Stack
`Bun -> Hono -> tRPC -> Zod -> Prisma -> Postgres -> MinIO/R2`

## Delivery Strategy
1. Build all functional flows first (no RBAC enforcement).
2. Keep permission middleware wired but permissive.
3. After all flows stabilize, enforce route-level permission checks.

---

## 1) Architecture Plan

1. **Runtime**
- Bun app entry with Hono HTTP server.
- `/trpc/*` as primary API surface.
- `/health`, `/ready` lightweight infra endpoints.

2. **App Layers**
- `router` (tRPC procedures)
- `service` (business rules + transactions)
- `repo` (Prisma query wrappers where useful)
- `domain` (state machines, calculators, validators)
- `infra` (storage, idempotency, logging, auth tokens)

3. **Core Conventions**
- One error shape across API.
- Cursor pagination for heavy lists.
- Zod-first input/output contracts.
- All mutations return deterministic response payloads.

---

## 2) Module Plan (Implementation Order)

1. **Foundation**
- Project scaffold, env, config, logger, Prisma client singleton.
- Request context (requestId, actor, org scope placeholder).

2. **Auth + Session**
- Login, refresh, logout, me.
- Password hashing, token issuance, refresh rotation.
- Invitation accept flow.

3. **Users / Roles / Invitations**
- User CRUD basics, role listing.
- Invitation lifecycle (`pending/accepted/revoked/expired`).

4. **Master Data**
- Brands, categories, products, images.
- Outlet CRUD and warehouse assignment.
- Warehouse CRUD + manager 1:1 relation handling.

5. **Warehouse + Inventory**
- Warehouse stock read APIs.
- Goods receipt create (header + lines).
- Stock adjustment create.
- No transfer module.

6. **Orders**
- Create order + lines.
- Approval/hold/reject/cancel transitions.
- Order totals + line totals recomputation.

7. **Dispatch**
- Create dispatch from approved orders.
- Quantity guardrails per order line.
- Mark delivered and recompute line/order statuses.

8. **Invoices**
- Auto-create invoice on order approval.
- Read/list invoices with due/paid state.

9. **Payments**
- Create payment.
- FIFO allocation into oldest unpaid invoices.
- Outlet outstanding synchronization.

10. **Attachments + Pending Uploads**
- Presigned upload URL flow (MinIO/R2).
- Confirm upload and bind to valid entity references.

11. **Notifications**
- List unread/read, mark read.
- System notifications on major lifecycle events.

12. **Audit Logs**
- Write audit events for all critical mutations.
- Query by entity and actor.

13. **RBAC Enforcement (last)**
- Convert permissive middleware to enforce permissions.
- Route-to-permission matrix rollout.

---

## 3) Business Rules To Lock Before Coding

1. **Order State Machine**
- `pending_approval -> approved | rejected | on_hold | cancelled`
- `approved -> partially_dispatched | fully_dispatched`
- Terminal transitions policy (reopen or not) must be explicit.

2. **Order Line Rules**
- `qtyOrdered > 0`
- `qtyDispatched <= qtyOrdered`
- Line status derived from quantities, never manually set directly.

3. **Dispatch Rules**
- Only from approved orders.
- Dispatch qty cannot exceed remaining qty.
- Single dispatch may include lines from multiple orders (allowed by schema).

4. **Inventory Rules**
- `currentQty` never below zero.
- Goods receipt increases stock.
- Stock adjustment may be +/- but final stock must stay non-negative (unless explicitly allowed by future override logic).

5. **Invoice Rules**
- One invoice per order (schema 1:1).
- Invoice generated only once at approval.
- `amountDue = total - amountPaid`, never negative.

6. **Payment Rules**
- FIFO allocation by `invoiceDate` then stable tiebreaker (`id`).
- Allocation sum must equal payment amount (or unapplied remainder policy must be explicit).
- No over-allocation on invoice.

7. **Attachment Rules**
- `entityType/entityId` must reference existing entity before confirm.
- Pending uploads expire; stale uploads are invalid.

8. **Sequence Rules**
- `OrderSequence` and `InvoiceSequence` increment atomically per year.
- Number format must be decided now (example: `SO-2026-000123`).

9. **Warehouse Manager Rules**
- One warehouse can have at most one manager.
- One user can manage at most one warehouse (current schema behavior).

---

## 4) API-Level Decisions Required

1. Soft delete vs hard delete for master data (likely soft via `isActive`).
2. Patch semantics: partial update allowed fields list per module.
3. Timezone policy for all date inputs/outputs (store UTC, output ISO).
4. Decimal handling in API (string transport recommended).
5. Sorting/filter fields per list endpoint.
6. Max page size and default page size.
7. Idempotency headers for `dispatch.create` and `payment.create`.

---

## 5) Cross-Cutting Technical Rules

1. **Transactions**
- Use Prisma transactions for all stock/finance/state mutations.
- Never split stock change + audit write across separate commits.

2. **Concurrency**
- Use row-level locks or serializable-safe patterns for:
- sequence generation
- payment allocation
- dispatch against same order lines

3. **Validation**
- Zod schemas for every procedure input/output.
- Domain validators for state transitions and invariants.

4. **Error Taxonomy**
- `BAD_REQUEST`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL`.
- Map Prisma errors to domain errors cleanly.

5. **Observability**
- Request ID + actor ID in logs.
- Audit event ID correlated with request ID.
- Metrics: mutation success/failure, latency, conflict rates.

---

## 6) Testing Plan

1. Unit tests
- State machines.
- Totals/allocation calculators.
- Validation guards.

2. Integration tests (DB)
- Goods receipt stock increment.
- Stock adjustment non-negative enforcement.
- Order approval -> invoice auto-create.
- Dispatch partial/full status propagation.
- FIFO payment allocation and outstanding balance sync.

3. Contract tests
- tRPC procedure input/output validation behavior.

4. Seed data
- Minimal deterministic fixture set for all modules.

---

## 7) Phased Rollout Plan (with Frontend Stop Points)

The backend will be delivered in strict phases. Each phase ends with a **hard stop point** where frontend aligns to frozen contracts before backend continues.

### Phase 0 — Foundation Contract Freeze
- Deliver:
  - Bun/Hono/tRPC scaffold, Prisma client, shared error model, request context.
  - `/health` and `/ready`.
  - Contract conventions (pagination, decimal transport, datetime format, error taxonomy).
- Stop point (Frontend alignment gate):
  - Frontend consumes shared API conventions doc and base client wiring.
  - Frontend request/response wrappers updated to final error + pagination shape.
  - No module-specific UI implementation before this gate is signed off.

### Phase 1 — Identity + Master Data
- Deliver:
  - Auth/session (`login`, `refresh`, `logout`, `me`), invitations, users/roles.
  - Catalog (`brands/categories/products/images`) + outlets + warehouses CRUD.
- Stop point (Frontend alignment gate):
  - Frontend ships auth/session integration and master-data screens against real endpoints.
  - User/role/outlet/catalog forms validated against final Zod contracts.
  - Remove auth and master-data mocks after parity verification.

### Phase 2 — Inventory + Orders Core
- Deliver:
  - Warehouse stock read APIs.
  - Goods receipt + stock adjustment flows (with invariants).
  - Sales order create/list/detail + approval/hold/reject/cancel transitions.
- Stop point (Frontend alignment gate):
  - Frontend inventory and order management pages migrated to live APIs.
  - Order lifecycle UI states locked to backend state machine.
  - FE/BE reconciliation test pass for totals and status derivation.

### Phase 3 — Dispatch + Financial Core
- Deliver:
  - Dispatch creation from approved orders + delivered transition.
  - Auto invoice generation on order approval.
  - Payment creation + FIFO invoice allocation + outstanding sync.
- Stop point (Frontend alignment gate):
  - Frontend dispatch board, invoice list/detail, and payment flows run fully on backend.
  - Finance UI totals and balances validated against backend calculators.
  - Mocks for dispatch/invoice/payment removed and blocked from reintroduction.

### Phase 4 — Attachments + Notifications + Audit
- Deliver:
  - Pending uploads + confirm binding flow.
  - Notification read/unread APIs + lifecycle event emitters.
  - Audit log write/query for critical mutations.
- Stop point (Frontend alignment gate):
  - Frontend attachment upload UX switched to presigned URL flow.
  - Notification center mapped to final entity routing map.
  - Admin/audit views aligned with final audit event schema.

### Phase 5 — RBAC Enforcement + Hardening
- Deliver:
  - Convert permissive middleware to enforced permission matrix.
  - Idempotency for critical mutations, conflict handling, edge-case hardening.
- Stop point (Frontend alignment gate):
  - Frontend role-based rendering aligned with enforced backend permissions.
  - 403/401 UX behavior verified for all protected workflows.
  - FE regression sweep for hidden/disabled actions by role.

### Phase 6 — Production Readiness
- Deliver:
  - Performance tuning, observability completeness, migration/seed reliability, release checklist.
- Stop point (Frontend alignment gate):
  - End-to-end UAT signoff on critical journeys (order-to-cash, inventory, dispatch, auth).
  - Final API contract tag consumed by frontend release candidate.

---

## 8) Decision Checklist (Needs Final Confirmation)

1. Exact order/invoice number format.
2. Terminal order state reopen policy.
3. Negative stock policy (strict no vs privileged override).
4. Payment unapplied remainder policy.
5. Soft-delete policy per module.
6. Dispatch cancellation/reversal policy.
7. Which events generate notifications.
8. Initial permission matrix (even if enforcement is deferred).

---

## 9) Frontend/Backend Sync Rules

1. No phase overlap: frontend starts integration for phase `N+1` only after phase `N` gate signoff.
2. Every phase produces:
   - frozen procedure list (read + mutation)
   - request/response payload snapshots
   - known error codes and conflict scenarios
3. Contract changes after a phase gate require explicit version note and changelog entry before merge.
4. Any temporary frontend fallback path must be removed in the same phase gate where backend support becomes stable.
