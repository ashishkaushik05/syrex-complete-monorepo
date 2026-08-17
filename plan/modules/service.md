# Module: Service Module
#status/in-progress

## What it does
After-sales service management. Service complaints raised by outlets (or customers via portal). Technicians assigned via service assignments. Service forms capture inspection data. Warranty claims handled via replacement orders or outlet invoicing. External clients can integrate via API with rotatable secrets.

## Components
- **Backend:** `service-complaints.ts`, `service-assignments.ts`, `service-forms.ts`, `service-warranty.ts`, `service-serials.ts`, `service-integrations.ts`, `service-portal.ts`, `service-portal-auth.ts` (helper), `service-tests.ts`
- **Web:** ServiceComplaintsPage, ServiceComplaintDetailPage, ServiceFormsPage, ServiceSerialsPage, ServiceWarrantyPage, ServiceIntegrationsPage
- **Service Portal:** Standalone Vite app — RegisterPage, LoginPage, ComplaintsPage, NewComplaintPage, ComplaintDetailPage
- **Mobile:** Planned (service mobile app — see Release 3/4 plan)

## Status
- ✅ Release 0 — schema reset (2026-06-09)
- ✅ Release 1 — internal admin production-ready (2026-06-09)
- ✅ Release 2 — customer portal (2026-06-10, in-progress)
- ✅ Complaints CRUD with org scoping
- ✅ Service assignments (technician → complaint)
- ✅ Service forms + validation
- ✅ Warranty fulfillment (replacement orders or outlet invoice at 100% discount)
- ✅ External integration (API clients with HMAC secrets)
- ✅ Serial tracking
- ⚠️ Tests: partial (`service-idor.test.ts`, `service-portal-auth.test.ts`, `service-release3.test.ts`, `service-release4.test.ts`, `service-shared.test.ts`)
- ❌ M-07: `createFulfillmentOrder` skips stock adjustment
- ❌ M-18: `ServiceSerialEvent` unique constraint missing `orgId`

## Open Issues
- M-07 → [[audit/ISSUES#M-07]]
- M-18 → [[audit/ISSUES#M-18]]

## Key Decisions
- [[decisions/service]] — all service module decisions

## Related Docs
- [[service-module/README]]
- [[service-module/08-RELEASE-PLAN]]
- [[service-module/01-ARCHITECTURE]]
- [[service-audit/MASTER_AUDIT]]
- [[audit/agent-batches/04-service-module-idor]]
