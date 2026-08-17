# System Modularization Report — Building Every Unit Separately

_Author: claude-opus-4-8 · Date: 2026-07-12 · Status: proposal for review_
_Related: [[decisions/infrastructure]] · [[decisions/accounts]] · [[decisions/accounts-market-research]]_

> **Goal (from the founder):** stop building one entangled app. Build each unit —
> Accounts, Sales, Distribution, Service, Inventory, CRM, Field Sense — as a
> **separate, self-contained module** with its own business logic, so a change in
> one doesn't ripple through the others and each can evolve (and one day deploy)
> independently.

---

## 0. The headline recommendation

**Build a Modular Monolith with hard internal boundaries and an in-process event
bus — NOT microservices (yet).** One deployable, one database, but the code is
split into modules that can only talk through published contracts and events.
Extract a module into its own service *later*, only when a real forcing function
appears (independent scale, separate team, separate tenant isolation).

Why not microservices now: your business logic is **transactionally coupled**
today — a single dispatch writes stock + order + invoice-adjacent state in one DB
transaction. Splitting that across network boundaries turns one ACID transaction
into a distributed saga with compensation logic. For a single distributor that is
all cost, no benefit. The modular monolith gives you 90% of the separation
(independent code, clear ownership, testability) with none of the distributed-
systems tax. The boundaries you draw now are what make a future service extraction
a lift-and-shift instead of a rewrite.

---

## 1. Current state — what the code actually shows

### 1.1 The domains (by RBAC `group` + route clustering)

| Unit (bounded context) | Routes today | ~LOC |
|---|---|---|
| **Identity & Access** | auth, users, roles, invitations, rbac/* | ~1,150 |
| **CRM / Customer** | outlets, outlet-access, outlet-portal, org-billing-profile | ~1,220 |
| **Catalog** | brands, categories, products, images | ~720 |
| **Inventory & Warehousing** | inventory, warehouses | ~910 |
| **Sales / Orders** | orders, orders-shared | ~1,050 |
| **Distribution / Dispatch** | dispatches | ~710 |
| **Accounts / Finance** | accounts (ledger), invoices, payments, tax-charges | ~1,760 |
| **Service** | service-* (11 files) | ~5,700 |
| **Field Sense** | field-* (9 files) | ~2,960 |
| **Platform / Shared** | attachments, images, system, sse, cron, context, infra | ~1,400 |

Total ≈ 25.5k LOC of route logic. Service and Field Sense are the two biggest and
are already the most self-contained — good news, they separate cleanly.

### 1.2 The coupling map (who imports whom)

```
field-*        ──► field-helpers                         (self-contained cluster ✔)
service-*      ──► service-shared, service-access        (self-contained cluster ✔)
  service-warranty ──► orders-shared, attachments        ✗ Service reaches into Sales
  service-portal   ──► attachments                       (shared platform, ok)
orders         ──► orders-shared, outlet-access
outlet-portal  ──► orders-shared, outlet-access
orders-shared  ──► outlet-access, accounts/posting       (Sales → Accounts, intended)
accounts       ──► outlet-access                         ✗ Accounts depends on CRM scoping
invoices/payments/dispatches/outlets ──► outlet-access   (shared authz kernel)
```

`outlet-access` is a de-facto **shared kernel** for the whole sales/finance cluster
(8 importers). `field-helpers`, `service-shared`, `service-access` are per-cluster
kernels. These are healthy — the problem is the *data writes*, not the imports.

### 1.3 The real problem — cross-domain WRITE ownership

Each table should be written by exactly ONE module. Today these are violated:

| Table (owner) | Also written by | Why it's a problem |
|---|---|---|
| `outlet.outstandingBalance` (CRM) | invoices, payments, orders-shared | 3 finance flows mutate a CRM entity's denormalized balance |
| `saleOrder` / `saleOrderLine` (Sales) | dispatches, outlet-portal, service-warranty | dispatch & service mutate order fulfilment state directly |
| `invoice.amountPaid/amountDue` (Accounts) | payments, orders-shared, service-warranty | ok within Accounts; service-warranty is the outlier |
| `warehouseStock` (Inventory) | dispatches | dispatch decrements stock by writing Inventory's table |
| `serviceComplaint` / `serviceSerialEvent` (Service) | dispatches | dispatch closes/updates service state directly |

**Hub entities** (write fan-in): `Outlet` (5 writers), `SaleOrder` (5),
`Invoice` (4), `WarehouseStock` (2), `ServiceComplaint` (4). These five are where
the modules bleed into each other.

### 1.4 Tenancy inconsistency (must be fixed for "separate units" to mean anything)

`orgId` exists on **Field Sense and Service** models but **not** on core Sales /
Accounts / Inventory / CRM models, and it's populated from `DEFAULT_ORG_ID` env.
So the system is effectively **single-tenant**, with org-scoping half-applied.
Any modular boundary must standardize this (see §4.1).

---

## 2. Target architecture — the units and their contracts

### 2.1 Bounded contexts (the "separate units")

```
┌──────────────────────────────────────────────────────────────────────┐
│  PLATFORM KERNEL  (depends on nothing; everything depends on it)       │
│  tenancy(orgId) · actor & permissions · money/Decimal · ids · errors   │
│  · event bus · audit · object-storage · sse · cron scheduler           │
└──────────────────────────────────────────────────────────────────────┘
        ▲          ▲          ▲          ▲          ▲          ▲
┌───────┴───┐ ┌────┴────┐ ┌───┴────┐ ┌───┴─────┐ ┌──┴──────┐ ┌─┴────────┐
│ Identity  │ │ Catalog │ │  CRM   │ │Inventory│ │  Sales  │ │  Field   │
│ & Access  │ │         │ │(Outlet)│ │  & WH   │ │ Orders  │ │  Sense   │
└───────────┘ └─────────┘ └────────┘ └─────────┘ └────┬────┘ └──────────┘
                                          ▲           │
                                          │      ┌────┴──────┐   ┌─────────┐
                                          └──────┤Distribution│   │ Service │
                                                 │  Dispatch  │   │         │
                                                 └────┬───────┘   └────┬────┘
                                                      ▼                ▼
                                              ┌───────────────────────────┐
                                              │   Accounts / Finance       │
                                              │  (Ledger · Invoices ·      │
                                              │   Payments · Tax · GST)    │
                                              └───────────────────────────┘
```

**Dependency rule (must stay acyclic):** arrows point to what a module MAY depend
on. Accounts depends on nothing but the kernel and consumes *events*; it never
imports Sales/CRM. Sales may read Catalog/CRM/Inventory contracts. Distribution
orchestrates Sales+Inventory. Service and Field Sense are leaf modules.

### 2.2 Each module's shape (uniform)

```
src/modules/<unit>/
  index.ts          ← PUBLIC API: the only file other modules may import
  domain/           ← business logic (pure where possible), owns its tables
  routes.ts         ← tRPC router for this unit
  events.ts         ← events it PUBLISHES + handlers it SUBSCRIBES to
  contracts.ts      ← DTOs/types exposed to other modules (no Prisma types leak)
  <unit>.test.ts
```

Rules:
- A module may import **only** another module's `index.ts` (its published API),
  never its `domain/` internals or its Prisma tables.
- A module owns a **disjoint set of tables**. No other module writes them.
- Cross-module effects happen via **service calls** (synchronous, same-tx when
  needed) or **events** (asynchronous side effects). See §3.

### 2.3 Table ownership (the disjoint partition)

| Module | Owns (writes) |
|---|---|
| Identity & Access | User, Role, UserInvitation, AuthSession |
| Catalog | Brand, Category, Product, Image |
| CRM | Outlet, BillingProfile, OutletAccess |
| Inventory & WH | Warehouse, WarehouseStock, GoodsReceipt*, InventoryMovement, StockAdjustment |
| Sales | SaleOrder, SaleOrderLine, OrderSequence |
| Distribution | Dispatch, DispatchLine, DispatchLineSerial, DispatchTimeline |
| **Accounts** | Invoice*, InvoiceCharge, TaxCharge, OutletPayment*, LedgerAccount, JournalEntry, JournalLine, JournalSequence |
| Service | ServiceComplaint*, ServiceSerial*, ServiceForm*, ServiceWarrantyDecision, ServiceUser* |
| Field Sense | Shift*, FieldLocation, FieldVisit, FieldStop, DailyAttendance |
| Kernel | AuditLog, CronLock |

---

## 3. Cutting the five seams (the actual work)

Each violation from §1.3 gets converted to a contract or an event.

### Seam 1 — `Outlet.outstandingBalance` written by Accounts flows
- **Owner:** CRM.
- **Fix:** Accounts publishes `InvoiceIssued`, `PaymentReceived`, `PaymentVoided`.
  CRM subscribes and recomputes the outlet balance. Accounts stops writing `outlet`.
- **Alternative (if you need it synchronous/consistent):** CRM exposes
  `crm.applyBalanceDelta(tx, outletId, delta)` in its public API; Accounts calls it
  within the same transaction. Prefer this for now (keeps the invariant exact),
  move to events when you need async.

### Seam 2 — Dispatch writes `warehouseStock` (Inventory)
- **Fix:** Inventory exposes `inventory.reserveAndDeduct(tx, {warehouseId, lines})`
  which writes `WarehouseStock` + `InventoryMovement`. Distribution calls it; it
  never touches the stock table itself.

### Seam 3 — Dispatch writes `saleOrder` fulfilment (Sales)
- **Fix:** Sales exposes `sales.markDispatched(tx, {orderId, lines})` that updates
  order/line status. Distribution calls it. (Or: Distribution emits
  `GoodsDispatched`, Sales subscribes — but fulfilment status is usually wanted
  synchronously, so a same-tx service call is cleaner here.)

### Seam 4 — Dispatch writes `serviceComplaint` / `serviceSerialEvent` (Service)
- **Fix:** Service exposes `service.recordSerialDispatch(tx, ...)` /
  `service.linkDispatchToComplaint(...)`. Distribution calls the Service API.

### Seam 5 — `service-warranty` writes `saleOrder` + `invoice` (Sales + Accounts)
- **Fix:** Service calls `sales.createWarrantyReplacementOrder(...)` and lets the
  normal Sales→Accounts flow (and the ledger posting we just built) run. Service
  stops constructing orders/invoices by hand.

**Net effect:** after these five cuts, every table has exactly one writer, and the
already-built ledger posting (`orders-shared → accounts/posting`) becomes the
*single* place Accounts learns about a sale — which is exactly the "Accounts is its
own unit" outcome you asked for.

---

## 4. The Platform Kernel (shared, depended-on by all)

### 4.1 Tenancy — fix first
Add `orgId` consistently to all root entities (or commit to single-tenant behind a
kernel-provided `ctx.orgId`). Recommendation for the single-distributor v1: keep
one org, but **route every module's queries through a kernel `scope(orgId)` helper**
so that going multi-tenant later is a kernel change, not a 40-file migration. This
directly serves the "tool every battery org uses" vision.

### 4.2 Event bus (in-process now, broker-ready later)
A tiny typed pub/sub in the kernel: `bus.publish(event)` / `bus.subscribe(type, h)`.
- Publish inside the same DB transaction, dispatch handlers *after commit* for async
  effects; use direct service calls for effects that must be in-tx (see §3).
- Events are the seam that lets you later move a subscriber into its own service:
  swap the in-process bus for a real broker (NATS/Redis/SQS) with no domain change.
- Candidate events: `InvoiceIssued`, `PaymentReceived`, `PaymentVoided`,
  `OrderPlaced`, `OrderApproved`, `GoodsDispatched`, `StockAdjusted`,
  `WarrantyApproved`, `ComplaintClosed`.

### 4.3 Money, ids, errors, audit
Centralize `Prisma.Decimal` money helpers (rounding, GST split already in
`accounts/posting.ts`), id generation, `apiError`, and `AuditLog` writing. These
are used everywhere and must not live inside a domain module.

---

## 5. Enforcement — boundaries that can't rot

A boundary that isn't enforced is a suggestion. Add:
1. **Import linting** — `dependency-cruiser` or ESLint `no-restricted-imports`:
   forbid importing another module's `domain/**` (only `index.ts` allowed), and
   forbid dependency cycles. Wire into `ci:preflight`.
2. **One-writer test** — a CI check (or code review rule) that greps for
   `prisma.<table>.(create|update|delete)` outside the owning module.
3. **Prisma types don't cross boundaries** — module public APIs speak in
   `contracts.ts` DTOs, not raw Prisma models, so a schema change in one module
   can't silently break another.
4. Keep the existing `rbac:preflight`; extend the RBAC `group` to match module
   names 1:1 so permissions and modules stay aligned.

---

## 6. Migration path (strangler, no big-bang rewrite)

Order chosen so each step is independently shippable and low-risk:

- **P0 — Scaffolding.** Create `src/modules/`, the kernel (event bus, scope, money,
  errors, audit). No behaviour change. Add import-lint (allow-list current imports,
  then tighten).
- **P1 — Move the clean units first.** Field Sense and Service are already self-
  contained: relocate into `modules/field/` and `modules/service/`, add their
  `index.ts` public APIs. Immediate win, near-zero seam work.
- **P2 — Carve Accounts as a true unit.** Move invoices/payments/tax/ledger into
  `modules/accounts/`. Cut **Seam 1** (stop writing `outlet` — call CRM API or emit
  event). Accounts now owns only its tables. This is the unit you care most about.
- **P3 — Sales & Inventory contracts.** Introduce `sales.markDispatched`,
  `inventory.reserveAndDeduct`, `sales.createWarrantyReplacementOrder`. Cut
  **Seams 2–5** in Distribution and Service.
- **P4 — CRM & Catalog & Identity** into modules; formalize `outlet-access` as the
  CRM public API (rename off "outlet-access").
- **P5 — Tenancy pass.** Apply kernel `scope(orgId)` uniformly; add `orgId` where
  missing. Now genuinely multi-tenant-ready.
- **P6 — (Optional, later) Extract a service.** First candidate: **Field Sense**
  (high-write location ingest, SSE fan-out, independent scale). Everything else
  stays in the monolith until a real forcing function appears.

Each phase leaves the app fully working; nothing is a flag day.

---

## 7. When to extract a real microservice (the honest bar)

Extract a module into its own deployable ONLY when at least one is true:
- It needs **independent scaling** (Field Sense location ingest is the only likely one).
- A **separate team** owns it and deploy cadence conflicts.
- It needs **hard data/tenant isolation** (a big enterprise battery client demands it).
- It has a **fundamentally different runtime** (e.g. an ML optimizer for BatteryOS).

Until then, physical separation buys you distributed-transaction complexity,
network failure modes, and eventual-consistency bugs — for a single distributor,
strictly negative. The module boundaries above are what make the *eventual*
extraction cheap, which is the whole point of doing them now.

---

## 8. Summary

- Adopt a **modular monolith**: one deploy, one DB, hard module boundaries + events.
- Ten bounded contexts, each owning a **disjoint set of tables**, talking only
  through published `index.ts` APIs and a kernel **event bus**.
- The concrete work is **five write-seam cuts** (dispatch→stock/order/service,
  accounts→outlet balance, service→sales/accounts) plus a **kernel** and
  **import-lint enforcement**.
- Migrate **strangler-style**: Field/Service first (nearly free), then Accounts as a
  clean unit, then the Sales/Inventory/Distribution contracts, then tenancy.
- Keep microservices as a **later, evidence-driven** step (Field Sense first, if ever).

This gives you exactly what you asked for — Accounts as a completely separate unit,
Sales separate, each domain independently evolvable — without paying the distributed-
systems tax before the business needs it.
