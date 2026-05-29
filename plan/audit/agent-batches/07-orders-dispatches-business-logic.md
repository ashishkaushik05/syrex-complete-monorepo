# Batch 07 — Orders, Dispatches & Warranties: Business Logic Fixes

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

## Files you will touch
- `backend/src/trpc/routes/dispatches.ts`
- `backend/src/trpc/routes/orders.ts`
- `backend/src/trpc/routes/service-warranty.ts`
- `backend/src/trpc/routes/orders-shared.ts`
- `backend/src/trpc/routes/payments.ts` (L-17)

## Do NOT touch
Invoices scoping — Batch 03. Service module IDOR — Batch 04. Schema — Batch 08.

---

## Issues to fix

### [C-10] Stock deduction race condition
**File:** `backend/src/trpc/routes/dispatches.ts:345-367`

Read-check-write is not atomic even inside a transaction (two concurrent dispatches can both pass the check before either commits the decrement). Use a `SELECT ... FOR UPDATE` row lock inside the transaction.

**Implementation:**
```typescript
import { Prisma } from "@prisma/client";

await prisma.$transaction(async (tx) => {
  for (const line of lines) {
    // IMPORTANT: use $queryRaw (tagged template — auto-parameterised), NEVER $queryRawUnsafe.
    const rows = await tx.$queryRaw<Array<{ current_qty: number }>>`
      SELECT current_qty
      FROM warehouse_stocks
      WHERE warehouse_id = ${line.warehouseId}::uuid AND product_id = ${line.productId}::uuid
      FOR UPDATE
    `;
    if (!rows[0] || rows[0].current_qty < line.qtyDispatched) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Insufficient stock for product ${line.productId}`,
      });
    }
    await tx.warehouseStock.update({
      where: { warehouseId_productId: { warehouseId: line.warehouseId, productId: line.productId } },
      data: { currentQty: { decrement: line.qtyDispatched } },
    });
  }
  // rest of dispatch creation...
}, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
```

**Column names verified** from `schema.prisma:382-397`: `WarehouseStock` is mapped to `warehouse_stocks`, columns `warehouse_id`, `product_id`, `current_qty`. Use exactly these names in the raw SQL.

The `::uuid` casts are needed because Prisma binds parameters as text by default and PostgreSQL won't coerce when comparing to `uuid` columns.

### [M-12] Serial count not validated against `qtyDispatched`
**File:** `backend/src/trpc/routes/dispatches.ts:414-423`

```typescript
for (const line of lines) {
  if (line.serialNumbers && line.serialNumbers.length !== line.qtyDispatched) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Serial count (${line.serialNumbers.length}) must match dispatched quantity (${line.qtyDispatched}) for product ${line.productId}`,
    });
  }
}
```

### [H-10] Auto-invoice must use `order.taxSnapshot`
**File:** `backend/src/trpc/routes/orders.ts:542-555`

```typescript
let chargeDefs = order.taxSnapshot as TaxChargeDef[] | null;
if (!chargeDefs || chargeDefs.length === 0) {
  console.warn(`Order ${order.id} has no taxSnapshot — falling back to live charges (legacy)`);
  chargeDefs = await tx.taxCharge.findMany({ where: { isActive: true } });
  if (!chargeDefs || chargeDefs.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot auto-invoice: order has no tax snapshot and no active charges exist",
    });
  }
}
```

### [M-07] Warranty fulfillment order must adjust stock
**File:** `backend/src/trpc/routes/service-warranty.ts:404-440`

`createFulfillmentOrder` creates a replacement `SaleOrder` with `status: "approved"` and `suppressAutoInvoice: true`, skipping the approval path that triggers stock decrements.

**Schema reference** (`schema.prisma:428-444`): `StockAdjustment` columns are `warehouseId`, `productId`, `adjustmentQty Int`, `reason String`, `adjustedById String`. **There is no `referenceId` field.** Encode the order reference in `reason`.

```typescript
for (const line of fulfillmentLines) {
  await tx.stockAdjustment.create({
    data: {
      warehouseId: line.warehouseId,
      productId: line.productId,
      adjustmentQty: -line.qty,                                  // negative = outbound
      reason: `warranty_replacement:${fulfillmentOrder.id}`,     // ref encoded in reason
      adjustedById: ctx.actor.id!,
    },
  });
  await tx.warehouseStock.update({
    where: { warehouseId_productId: { warehouseId: line.warehouseId, productId: line.productId } },
    data: { currentQty: { decrement: line.qty } },
  });
}
```

If concurrent fulfillment is plausible, wrap the decrement in the same `FOR UPDATE` pattern as C-10. For warranty volume this is likely overkill — skip unless evidence says otherwise.

### [L-16] Idempotent `markDelivered`
**File:** `backend/src/trpc/routes/dispatches.ts:571-636`

Guard auto-resolve so a re-call of `markDelivered` on an already-delivered dispatch is a no-op:
```typescript
if (dispatch.deliveryStatus === "delivered") {
  return dispatch; // idempotent: skip side effects
}
```

### [L-17] `amountPaid` must not exceed invoice total
**File:** `backend/src/trpc/routes/payments.ts:178` (the `invoice.amountPaid.add(allocate)` site)

Before the update call:
```typescript
const nextAmountPaid = invoice.amountPaid.add(allocate);
if (nextAmountPaid.greaterThan(invoice.total)) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Allocation would exceed invoice total (current ${invoice.amountPaid}, allocate ${allocate}, total ${invoice.total})`,
  });
}
```
Use `Prisma.Decimal` arithmetic — do not convert to Number.

### [L-07] `DispatchTimeline.actorRole` — typed helper
**File:** `backend/src/trpc/routes/dispatches.ts:442,489,535,562`

```typescript
type DispatchActorRole = "admin" | "warehouse" | "outlet";

function resolveActorRole(ctx: TrpcContext): DispatchActorRole {
  if (ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) return "admin";
  if (ctx.permissions.includes("dispatches:write")) return "warehouse";
  return "outlet";
}
```
Replace inline string literals in `DispatchTimeline` creates with `resolveActorRole(ctx)`.

### [L-08-bis] Order-existence probing in `orders.list`
If `orders.list` accepts both `outletId` and another scoping filter (e.g. `customerId`), apply the same cross-field validation pattern as Batch 03 §L-08. Inspect the route; if not present, skip.

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] Two concurrent dispatch requests for stock-of-1 do not both succeed
- [ ] Dispatch with qty 10 but 5 serials returns `BAD_REQUEST`
- [ ] Approving an order uses `taxSnapshot` — changing a `TaxCharge` after order creation does not affect the generated invoice
- [ ] Warranty fulfillment order writes a `StockAdjustment` with `adjustmentQty: -<qty>` and decrements `warehouseStock`
- [ ] Calling `markDelivered` on a delivered dispatch is a no-op (no double-resolve)
- [ ] Payment allocation that would push `amountPaid > total` returns `BAD_REQUEST`
- [ ] Regression tests cover the C-10 race (two concurrent transactions), the M-07 stock decrement, and the L-17 cap
