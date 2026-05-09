# Phase 3 Contract Freeze (Dispatch + Financial Core)

Date: 2026-05-08
Decision Entry: `DEC-20260508-012`

## Frozen Procedure Surface

- `dispatches.list`
- `dispatches.getById`
- `dispatches.create`
- `dispatches.markDelivered`
- `invoices.list`
- `invoices.getById`
- `payments.list`
- `payments.getById`
- `payments.create`
- `orders.transition` (approval path invoice auto-generation behavior locked)

## Contract Conventions

- Error taxonomy remains: `BAD_REQUEST`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL`.
- tRPC error formatter includes `data.requestId` in all responses.
- All Phase 3 procedures are protected and require `x-actor-id`.
- Pagination contract for list endpoints:
  - input: `{ cursor?: string | null, limit?: number, ...filters }`
  - output: `{ items: T[], nextCursor: string | null }`
- Decimal transport is string for financial amounts:
  - `invoices.subtotal`, `invoices.total`, `invoices.amountPaid`, `invoices.amountDue`
  - `payments.amount`, `payments.allocations[].amount`
- Date/time fields are emitted as ISO-8601 UTC strings.
  - `dispatches.deliveredAt` is emitted as ISO-8601 UTC string or `null`.

## Phase 3 Rule Locks

- Dispatch invariants:
  - Dispatch create is allowed only for order lines belonging to `approved` or `partially_dispatched` orders.
  - Dispatch quantity cannot exceed remaining order-line quantity.
  - Dispatch create decrements `warehouse_stocks.currentQty`; insufficient stock returns `CONFLICT`.
  - Dispatch create updates order-line dispatched quantities/status and derives order status (`approved` -> `partially_dispatched`/`fully_dispatched`) when applicable.
  - `dispatchDate` remains shipment timestamp and is not overwritten by delivered transition; delivered transition writes `deliveredAt`.
- Invoice invariants:
  - Invoice is auto-generated once on order approval (`orders.transition` action=`approve`) using order totals/lines.
  - Invoice generation is idempotent per order (`orderId` 1:1).
- Payment invariants:
  - Payment amount must be greater than zero.
  - Allocation follows FIFO against open invoices by `invoiceDate ASC, id ASC`.
  - Allocation updates invoice `amountPaid` and `amountDue` and syncs outlet `outstandingBalance` as sum of due invoices.

## Validation Executed

- `cd backend && bun run typecheck` passed on 2026-05-08.
- `bash backend/scripts/phase3-smoke.sh` passed on 2026-05-08 (live Postgres force-reset + seed + API + tRPC route sweep).
- Response snapshots captured under `plan/phase-gates/snapshots/phase3_*.json` for all frozen Phase 3 procedures.
- Negative-path snapshots captured:
  - `phase3_negative_dispatches_markDelivered_duplicate.json` => `CONFLICT`
  - `phase3_negative_dispatches_create_insufficient_stock.json` => `CONFLICT`
  - `phase3_negative_payments_create_invalid_amount.json` => `BAD_REQUEST`

## Frontend Alignment Notes

- Frontend dispatch workflows can bind to `dispatches.create`, `dispatches.getById`, `dispatches.list`, and `dispatches.markDelivered`.
- Frontend finance workflows can bind to `invoices.list`, `invoices.getById`, `payments.create`, `payments.list`, and `payments.getById`.
- Approval flow must treat invoice creation as backend-owned side effect of `orders.transition(approve)`; frontend should not create invoices directly.
- Frontend integration and mock-removal evidence is tracked in `plan/phase-gates/PHASE_3_FRONTEND_ALIGNMENT.md`.
