# Module: Outlets
#status/done

## What it does
Customer outlets (retail stores, distributors) that place orders. Outlets belong to an org and are scoped accordingly. Outlet portal provides a self-service view for outlet owners.

## Components
- **Backend:** `outlets.ts`, `outlet-access.ts` (helpers), `outlet-portal.ts`
- **Web:** OutletsPage, OutletDetailPage
- **Mobile:** Flutter outlet owner app (`mobile/outlet_owner_template/`)

## Status
- ✅ Outlet CRUD with org scoping
- ✅ Outlet portal (outlet owner self-service)
- ✅ Flutter mobile app (sales rep / outlet owner flow)
- ✅ Tests: `outlets.test.ts`, `outlet-portal.test.ts`
- ⚠️ Outlet.orgId column missing — needed for Batch 08 multi-org scoping fixes

## Open Issues
- Batch 08 dependency: `Outlet.orgId` schema column → [[audit/agent-batches/08-schema-migration]]

## Key Decisions
- [[decisions/orders]] — outlet access decisions tracked here

## Related Docs
- [[mobile/outlet-app/SCREENS_SPEC]]
- [[mobile/outlet-app/SERVICE_COMPLAINT_AUDIT]]
- [[audit/agent-batches/03-org-isolation-outlets-invoices]]
