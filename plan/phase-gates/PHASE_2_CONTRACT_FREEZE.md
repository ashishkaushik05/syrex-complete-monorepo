# Phase 2 Contract Freeze (Inventory + Orders Core)

Date: 2026-05-08
Decision Entry: `DEC-20260508-010`

## Frozen Procedure Surface

- `inventory.stockList`
- `inventory.createGoodsReceipt`
- `inventory.createStockAdjustment`
- `orders.create`
- `orders.list`
- `orders.getById`
- `orders.transition`

## Contract Conventions

- Error taxonomy remains: `BAD_REQUEST`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL`.
- tRPC error formatter includes `data.requestId` in all responses.
- All Phase 2 procedures are protected and require `x-actor-id`.
- Pagination contract for list endpoints:
  - input: `{ cursor?: string | null, limit?: number }`
  - output: `{ items: T[], nextCursor: string | null }`
- Decimal transport is string for order and line totals/price fields:
  - `orders.totalValue`
  - `orders.lines[].unitPrice`
  - `orders.lines[].lineTotal`
- Date/time fields are emitted as ISO-8601 UTC strings.

## Phase 2 Rule Locks

- Inventory invariants:
  - Goods receipt always increases `warehouse_stocks.currentQty`.
  - Stock adjustment cannot make `currentQty` negative.
- Order invariants:
  - `qtyOrdered > 0` required for every order line.
  - `lineTotal = qtyOrdered * unitPrice` and `totalValue = sum(lineTotals)`.
  - Transition guards:
    - `approve`: only from `pending_approval` or `on_hold`
    - `hold`: only from `pending_approval`
    - `reject`: only from `pending_approval` or `on_hold`
    - `cancel`: blocked for `fully_dispatched`, `rejected`, `cancelled`

## Validation Executed

- `cd backend && bun run typecheck` passed on 2026-05-08.
- `bash backend/scripts/phase2-smoke.sh` passed on 2026-05-08 (live Postgres force-reset + seed + API + tRPC route sweep).
- Response snapshots captured under `plan/phase-gates/snapshots/phase2_*.json` for all frozen Phase 2 procedures.

## Frontend Alignment Notes

- Frontend inventory pages can now bind to `inventory.stockList`, `inventory.createGoodsReceipt`, and `inventory.createStockAdjustment`.
- Frontend order pages can now bind to `orders.create`, `orders.list`, `orders.getById`, and `orders.transition`.
- Order lifecycle UI states should align with transition guards above and not assume unsupported transition paths.
