# Batch 03 — Org Isolation: Outlets, Invoices & Outlet Portal

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

## Decision context
- **D-05:** `Outlet.orgId` is added by Batch 08 (must run first). Until that lands, use the warehouse-chain fallback (`outlet.warehouse.org.id`) as the default code path with a `// TODO: replace with outlet.orgId once Batch 08 ships` comment.
- **D-06:** Outlet-role users (identified by `findActorLinkedOutletId(ctx)` returning a non-null outletId) may only see their own outlet. Internal users with `outlets:read` see all outlets scoped to their org.
- **No sentinel strings.** When the actor lacks an `orgId` AND is not an outlet user, throw `FORBIDDEN` explicitly.

## Files you will touch
- `backend/src/trpc/routes/outlets.ts`
- `backend/src/trpc/routes/outlet-access.ts` (only if a helper signature needs widening)
- `backend/src/trpc/routes/outlet-portal.ts`
- `backend/src/trpc/routes/invoices.ts`

## Do NOT touch
Orders routes — Batch 07. Service routes — Batch 04. Schema — Batch 08. Auth — Batch 01.

## Dependency
This batch assumes Batch 08 has already added `orgId` to `Outlet`. If running before Batch 08, every `outlet.orgId` reference below must be replaced with the warehouse-chain form (`outlet: { warehouse: { orgId: ... } }`) — and replaced back once 08 ships. The plan below uses the **post-08 form** as canonical; the agent must adapt if 08 has not landed yet, and the decision-log entry must say which form was committed.

---

## Issues to fix

### [C-05] `outlets.list` — add org filter + outlet-user scoping
**File:** `backend/src/trpc/routes/outlets.ts:127-144`

```typescript
import { SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { findActorLinkedOutletId } from "./outlet-access";

const linkedOutletId = await findActorLinkedOutletId(ctx);

if (linkedOutletId) {
  // Outlet user — restrict to own outlet
  const where: Prisma.OutletWhereInput = { id: linkedOutletId, isActive: true };
  // ... apply only filters that make sense for a single-outlet view
} else {
  // Internal user — must have an orgId
  const orgId = ctx.actor.orgId;
  const isSuperAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
  if (!orgId && !isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Org context required" });
  }
  const where: Prisma.OutletWhereInput = {
    isActive: true,
    ...(isSuperAdmin ? {} : { orgId }),
    // ...other input filters
  };
}
```

### [C-06] `outlets.getById` — add org scope check
**File:** `backend/src/trpc/routes/outlets.ts:169-185`

Use `findFirst` with the scope baked into the `where` clause so wrong-org returns `NOT_FOUND` rather than leaking existence:

```typescript
const linkedOutletId = await findActorLinkedOutletId(ctx);
const isSuperAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION);

const outlet = await ctx.prisma.outlet.findFirst({
  where: linkedOutletId
    ? { id: input.id, isActive: true, ...(linkedOutletId !== input.id ? { id: "__no_match__" } : {}) }
    : isSuperAdmin
      ? { id: input.id }
      : { id: input.id, orgId: ctx.actor.orgId ?? "__no_match__" },
  // include...
});
if (!outlet) throw new TRPCError({ code: "NOT_FOUND" });
```

(The `__no_match__` literals are used purely as a query-impossibility marker here — they are not credentials or sentinels exposed in any other path.)

Cleaner alternative (preferred): guard before the query.
```typescript
if (linkedOutletId && linkedOutletId !== input.id) {
  throw new TRPCError({ code: "NOT_FOUND" });
}
const orgId = ctx.actor.orgId;
if (!linkedOutletId && !isSuperAdmin && !orgId) {
  throw new TRPCError({ code: "FORBIDDEN", message: "Org context required" });
}
const outlet = await ctx.prisma.outlet.findFirst({
  where: {
    id: input.id,
    ...(linkedOutletId ? {} : isSuperAdmin ? {} : { orgId }),
  },
  // include...
});
if (!outlet) throw new TRPCError({ code: "NOT_FOUND" });
```
Use this second form.

### [C-09] `invoices.list` — add warehouse/outlet scope
**File:** `backend/src/trpc/routes/invoices.ts:243-269`

Today this returns all invoices system-wide. Mirror the scope pattern used in `orders.list`:

1. Resolve `linkedOutletId = await findActorLinkedOutletId(ctx)`.
2. `isSuperAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION)`.
3. Build the outlet filter:
   - super-admin: no filter
   - outlet user: `{ outlet: { id: linkedOutletId } }`
   - warehouse manager (`ctx.managedWarehouseId != null`): `{ outlet: { warehouseId: ctx.managedWarehouseId } }`
   - internal with orgId: `{ outlet: { orgId: ctx.actor.orgId } }`
   - **else (no scope can be derived):** throw `FORBIDDEN`.

### [H-AUTH-INVOICES] `invoices.getById` — push scope into the query
**File:** `backend/src/trpc/routes/invoices.ts:271-284`

Apply the same scope clause to `findFirst` (do not fetch then check). On miss → `NOT_FOUND`.

### [D-06] Outlet portal — verify org isolation
**File:** `backend/src/trpc/routes/outlet-portal.ts:36-73`

`outlet-portal.summary` calls `assertOutletAccess` which validates `outlet.userId === actorId`. Add (after the existing check) an org assertion using `outlet.orgId`:
```typescript
if (!isSuperAdmin && outlet.orgId !== ctx.actor.orgId) {
  throw new TRPCError({ code: "FORBIDDEN" });
}
```

### [L-08] Prevent order-existence probing via cross-field filter
**File:** `backend/src/trpc/routes/invoices.ts:233-269`

When both `outletId` and `orderId` are passed to `invoices.list`, verify the order belongs to the outlet first:

```typescript
if (input.outletId && input.orderId) {
  const order = await ctx.prisma.saleOrder.findFirst({
    where: { id: input.orderId, outletId: input.outletId },
    select: { id: true },
  });
  if (!order) throw new TRPCError({ code: "NOT_FOUND" });
}
```

Note: a parallel fix in `orders.ts` (cross-field probing) is in scope for Batch 07. Do not edit `orders.ts` from this batch.

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] Outlet user calling `outlets.list` receives only their own outlet
- [ ] Internal user calling `outlets.list` with no orgId returns `FORBIDDEN` (not empty list)
- [ ] `outlets.getById` with another org's outlet ID returns `NOT_FOUND`
- [ ] `invoices.list` for a warehouse manager returns only their warehouse's invoices
- [ ] `invoices.list` for an outlet user returns only their outlet's invoices
- [ ] `invoices.list` with `outletId=A&orderId=<order-on-B>` returns `NOT_FOUND`
- [ ] Regression tests added for each of the above
