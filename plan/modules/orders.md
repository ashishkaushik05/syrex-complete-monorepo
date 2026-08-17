# Module: Orders / Dispatches
#status/done

## What it does
Sales order creation with line items, discounts, and tax charges. Orders transition through status states (pending → confirmed → dispatched → delivered). Dispatch planning assigns warehouse stock to outlet orders. Auto-invoice generated on dispatch confirmation.

## Components
- **Backend:** `orders.ts`, `orders-shared.ts` (helpers), `dispatches.ts`, `tax-charges.ts`
- **Web:** SalesOrdersPage, OrderDetailPage, SalesDispatchesPage, DispatchDetailPage, DispatchPlanPage

## Status
- ✅ Order creation with line items, discounts, tax
- ✅ Dispatch workflow (plan → confirm → deliver)
- ✅ Auto-invoice on dispatch confirmation
- ✅ Tax charge snapshots on order creation
- ✅ Tests: `orders.test.ts`, `dispatches.test.ts`
- ❌ C-10: Stock check + decrement not atomic (race condition / overselling)
- ❌ H-10: Auto-invoice uses live tax rates instead of `taxSnapshot`
- ❌ M-12: Serial count not validated against `qtyDispatched`

## Open Issues
- C-10 → [[audit/ISSUES#C-10]]
- H-10 → [[audit/ISSUES#H-10]]
- M-12 → [[audit/ISSUES#M-12]]

## Key Decisions
- [[decisions/orders]] — all orders/dispatch decisions

## Related Docs
- [[api-spec/03-DOMAIN_BEHAVIOR_STATE_MACHINES]]
- [[dispatch/README]]
- [[audit/ORDER_WAREHOUSE_REASSIGNMENT_REPORT_2026-06-09]]
