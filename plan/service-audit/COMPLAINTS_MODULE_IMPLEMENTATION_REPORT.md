# Complaints Module Implementation Report

Date: 2026-05-26  
Repo: `/home/ashish/Documents/code/syrex-new-api`  
Baseline checked: `master @ 3a545a2` with an already-dirty worktree  
Decision log: `DEC-20260526-001`

## Executive Summary

The complaints module is no longer just a scaffold on the web/backend path. The current web-operated flow covers complaint listing, complaint creation, assignment, form evidence, test submission, warranty approval/rejection, replacement serial assignment, fulfillment-order creation, serial intelligence, and activity timeline.

It is not production-ready yet. The strongest implementation path is the internal web console. The dedicated service mobile app is still placeholder-only, and the outlet-owner complaint UI is currently orphaned and contract-incompatible. Several backend invariants are improved from the earlier audit, but a few core workflow gaps remain:

- Outlet users are seeded with `service:read`/`service:write`, but `serviceComplaints.create` rejects non-internal users. The outlet app's raise-complaint feature cannot work against this backend.
- `serviceComplaints.list` does not accept `outletId`; the outlet app passes `outletId` anyway, which is ignored by the backend input schema.
- Replacement fulfillment requires `ServiceComplaintLine.productId`, but the web create dialog only captures serial and notes, and there is no visible line-edit flow to set product IDs later.
- Assignment has two active behavior paths: `serviceAssignments.assign/reassign` writes assignment history, while `serviceComplaints.transition` also accepts `assign` and changes status without assignment history.
- Org scoping for service routes is driven by client-provided `x-org-id`, not by a JWT/user-owned org field. This is workable only if the deployment has a trusted org-context layer; the current app adapter uses a dev fallback of `default`.
- Focused service IDOR tests are stale in this worktree: they fail because test fixtures no longer satisfy the auth middleware's `isActive` requirement, even though backend typecheck passes.

## Scope Reviewed

Backend:

- `backend/src/trpc/routes/service-complaints.ts`
- `backend/src/trpc/routes/service-assignments.ts`
- `backend/src/trpc/routes/service-tests.ts`
- `backend/src/trpc/routes/service-forms.ts`
- `backend/src/trpc/routes/service-warranty.ts`
- `backend/src/trpc/routes/service-serials.ts`
- `backend/src/trpc/routes/service-integrations.ts`
- `backend/src/trpc/routes/service-shared.ts`
- `backend/src/trpc/router.ts`
- `backend/src/rbac/modules/service.ts`
- `backend/scripts/seed-permissions.ts`
- `schema.prisma`

Web:

- `web/src/App.tsx`
- `web/src/pages/dashboard/DashboardLayout.tsx`
- `web/src/lib/api.ts`
- `web/src/pages/dashboard/ServiceComplaintsPage.tsx`
- `web/src/pages/dashboard/ServiceComplaintDetailPage.tsx`
- `web/src/pages/dashboard/ServiceWarrantyPage.tsx`
- `web/src/pages/dashboard/ServiceSerialsPage.tsx`
- `web/src/pages/dashboard/ServiceFormsPage.tsx`
- `web/src/components/service/DynamicServiceForm.tsx`
- `web/src/components/service/ServiceStatusBadge.tsx`

Mobile:

- `mobile/service_mobile_app/**`
- `mobile/outlet_owner_template/lib/core/api/service_complaints_client.dart`
- `mobile/outlet_owner_template/lib/modules/service/**`
- `mobile/outlet_owner_template/lib/app/router/app_router.dart`
- `mobile/outlet_owner_template/lib/modules/dashboard/dashboard_page.dart`
- `mobile/outlet_owner_template/lib/modules/more/more_page.dart`

## Data Model

The service schema is broad enough for a full complaint lifecycle:

- `ServiceComplaint`: complaint number, orgId, status, outlet link, raisedBy, closure fields, activity/test/form/warranty/order relations.
- `ServiceComplaintLine`: old serial, normalized old serial, replacement serial, productId, notes.
- `ServiceAssignmentHistory`: ASI/SE assignment audit trail.
- `ServiceTestReport`: verdict, summary, structured test data, optional complaint-line link.
- `ServiceComplaintActivity`: service activity timeline plus audit-log writes through `recordComplaintActivity`.
- `ServiceWarrantyDecision`: pending/approved/rejected decision plus warehouse, replacement serial, and replacement order linkage.
- `ServiceSerialIndex` and `ServiceSerialEvent`: serial intelligence and replacement event history.
- `ServiceFormTemplate`, `ServiceFormTemplateField`, `ServiceFormSubmission`, `ServiceFormSubmissionValue`: DB-driven diagnostic forms.
- `ServiceMachineClient` and audit rows: machine credential management.

Current lifecycle enum:

`raised -> assigned -> visit -> test_result_submitted -> retest_requested -> resolved | telephonic_closure | cancelled`

Important schema limitation: `Outlet` and `User` still have no direct `orgId`, while service models do. Service org scope therefore depends on the request context header rather than a relational tenant model.

## Backend Implementation

### Complaint Router

`serviceComplaints` exposes:

- `list`: cursor-paginated list with status and search filters, plus tab counts.
- `get`: list-item shape for a single complaint.
- `detail`: full complaint detail with lines, assignments, tests, activities, and warranty decision.
- `create`: creates complaint, complaint lines, complaint number, and initial activity.
- `update`: updates title/description/resolution note and records an activity.
- `transition`: applies lifecycle actions and records activity.

Security and scoping improvements are present:

- Every service complaint read/mutation now calls a local `requireOrgId`.
- Cross-org fetches use `findFirst({ id, orgId })` and return `NOT_FOUND`.
- Null org actors are refused.
- `transition` now checks action-specific permissions for assign, retest, telephonic close, cancel, and warranty actions.

Current backend issues:

- `create` is explicitly restricted to `userType === "internal"`, so outlet-raised complaints are not supported despite outlet roles having service permissions.
- `create` accepts `outletId` but does not verify outlet ownership/scope because `Outlet` has no `orgId`.
- `create` writes the complaint inside a transaction, then runs `ensureSerialIndex` after commit. If serial normalization fails or serial hydration errors, the complaint can remain created while the API returns an error.
- `complaintLineInputSchema` requires `serialNumber.min(2)` but does not require a non-empty normalized serial. Values like `!!` can pass input validation and fail later.
- `update` cannot edit complaint lines, productId, replacement serial, or outlet. This leaves no backend/web path to fix line product IDs after initial creation.
- `transition("assign")` is still active and can move status without writing `ServiceAssignmentHistory`; that overlaps with `serviceAssignments.assign`.

### Assignment Router

`serviceAssignments.assign` and `reassign` create assignment history, validate ASI/SE user roles, and record service activity.

Strengths:

- Requires `service:assign`.
- Blocks final-status reassignment.
- Validates internal, active users with expected ASI/SE role names.
- Moves `raised -> assigned` only when an ASI user is provided.

Gaps:

- Assigning only an SE to a `raised` complaint is allowed but leaves status as `raised`. The web warns that ASI is required, but the backend still accepts a no-status-change assignment.
- No list/history endpoint exists outside `detail`, so assignment history is only consumed through complaint detail.

### Forms And Tests

`serviceForms` manages templates, fields, submissions, and submission disabling. `serviceTests.submit` requires at least one non-disabled valid form submission before test report creation.

Strengths:

- Test submission is form-backed.
- Form validation supports text, textarea, number, boolean, select, multiselect, and date fields.
- Duplicate field keys and select/multiselect options are guarded.
- Regex validation has length and catastrophic-pattern mitigation.
- Submissions are immutable except disable-with-reason.

Gaps:

- `listSubmissions` is unpaginated.
- Unknown submitted field keys are ignored rather than rejected.
- Web test submission does not pass `complaintLineId`, so line-specific test reporting is not used from the main detail page.
- A user with `service:workflow` but without `service:form` can reach a workflow where the test action is blocked but they cannot submit the required evidence.

### Warranty And Fulfillment

`serviceWarranty` supports:

- warranty approve/reject,
- replacement serial assignment,
- replacement order creation.

Strengths:

- Approval/rejection require `service:approve`.
- Re-approval and double-rejection have conflict guards.
- Replacement serial conflict check is inside the transaction.
- Fulfillment order is created as `warranty_replacement` with `suppressAutoInvoice: true`.
- Replacement serial events are emitted for relevant fulfilled lines only.

Critical gap:

- Fulfillment requires complaint line `productId`. The web create path does not collect product IDs, and the complaint update API cannot add them later. Result: a typical web-created complaint cannot create a fulfillment order unless the line was created by another client with `productId` already set.

Open known issue:

- `plan/audit/ISSUES.md` still marks `M-07` open: `createFulfillmentOrder` creates a replacement order but skips stock adjustment.

### Serial Intelligence

`serviceSerials.resolve` hydrates from legacy dispatch serials and returns product, sold outlet, sales chain, complaint links, replacement conflicts, and recent events.

Strengths:

- The current `findSerialLegacyDispatchRows` implementation now queries `dispatchLineSerial` by normalized serial before loading dispatch lines; it is no longer the old full-table scan described in the May 24 master audit.
- `ServiceSerialEvent` now has a uniqueness constraint across normalized serial, entity, and event type.

Gaps:

- `serviceSerials.resolve` has read-side write effects through `ensureSerialIndex`.
- Complaint links and serial events are not visibly scoped by `orgId` in `serviceSerials.resolve`.
- Replacement conflict currently counts any replacement link, including terminal/cancelled complaint states.
- Event reads are capped at 50 with no pagination.

### Integrations

Machine-client management exists for list/create/rotate/revoke/authProbe.

Strengths:

- Allowed scopes are constrained to `service.read`, `service.write`, `service.form`.
- Past `expiresAt` is rejected during creation.
- Rotating/revoking clients is org-scoped.

Gaps:

- `authProbe` is the only machine-scoped business route. There are no machine-scoped complaint/form/test submission APIs yet.
- Service client credentials still come through headers (`x-service-client-id`, `x-service-client-secret`), which remains a proxy/access-log exposure concern unless infrastructure redacts those headers.

## RBAC And Seed State

Current service permissions:

- `service:read`
- `service:write`
- `service:workflow`
- `service:templates`
- `service:manage`
- `service:approve`
- `service:retest`
- `service:assign`
- `service:cancel`
- `service:telephonic`
- `service:form`

Seeded role intent:

- Outlet: `service:read`, `service:write`.
- ASI: `service:read`, `service:workflow`, `service:assign`, `service:retest`.
- Service Engineer: `service:read`, `service:form`, `service:workflow`.
- Dev Sales/Admin-like role: broad service permissions.

Important mismatch:

- Outlet has `service:write`, but backend create rejects non-internal users.
- Outlet has `service:read`, and `serviceComplaints.list` has no outlet filter. If outlet users can call this route with an org context, they can see org-level complaints, not only their own outlet complaints.

## Web Frontend

### Routing And Navigation

Service routes are registered:

- `/dashboard/service/complaints`
- `/dashboard/service/complaints/:id`
- `/dashboard/service/serials`
- `/dashboard/service/warranty`
- `/dashboard/service/integrations`
- `/dashboard/service/forms`

Sidebar entries are permission-gated:

- complaints and serial lookup: `service:read`
- warranty queue: `service:approve`
- integrations: `service:manage`
- form templates: `service:templates` or `service:manage`

### Complaints List Page

Implemented:

- status tabs,
- tab counts,
- search debounce,
- stats cards,
- complaint table,
- create dialog for internal complaint creation.

Limitations:

- Adapter always calls cursor `null` and `limit: 100`; there is no load-more UI.
- Create dialog captures outlet, title, description, serials, and notes only. It does not capture `productId`, which later blocks replacement fulfillment.

### Complaint Detail Page

Implemented:

- status pipeline,
- assignment panel,
- dynamic form evidence panel,
- test report panel,
- warranty decision panel,
- replacement fulfillment panel,
- lifecycle actions,
- serial intelligence,
- activity timeline.

Current UX/contract gaps:

- Assignment dropdowns are filtered client-side by role name; backend also validates roles.
- Test report submission does not let the user select a complaint line.
- `tested_ok_close` is shown from `visit` even before a test report exists; backend allows this from `visit`, so this is intentional in code but may conflict with a strict evidence-first policy.
- Fulfillment UI tells users product IDs are required, but it gives no way to set missing product IDs.
- Action permissions are partially enforced by hiding panels, but lifecycle action buttons are not individually hidden based on action-specific permissions. Backend will reject unauthorized actions.

### API Adapter

The web uses a REST-shaped adapter in `web/src/lib/api.ts` that maps `/tickets*` URLs to tRPC service procedures.

This adapter is now the main compatibility layer for service UI. It works, but it keeps legacy endpoint names (`/tickets`) over the new tRPC backend. That is acceptable only if it remains the single web adapter path and is not duplicated by a second direct tRPC UI path.

Org context issue:

- The adapter sends `x-org-id` from localStorage key `syrex_phase1_org_id`; in dev it falls back to `default`.
- Auth login/refresh responses do not include orgId.
- The backend JWT middleware sets actor/session headers but does not derive orgId. Service route access therefore depends on client-provided org context.

## Mobile Implementation

### Dedicated Service Mobile App

`mobile/service_mobile_app` is still scaffold-level:

- Queue page shows static stage cards and navigates to `/service/complaint/demo`.
- Detail page is placeholder text.
- Test capture page is placeholder text.
- No real complaint list API integration.
- No form capture integration.
- No assignment/work queue integration.
- No upload/attachment integration.
- No offline queue/retry behavior.

Verification:

- `flutter analyze` runs but reports 3 non-fatal issues: one unused import and two lint infos.

### Outlet Owner Mobile App

There are complaint files:

- `service_complaints_client.dart`
- `complaint_list_page.dart`
- `raise_complaint_page.dart`

However, they are not actually registered in `mobile/outlet_owner_template/lib/app/router/app_router.dart`, and no dashboard/more-page action links to them.

Even if registered, the client does not match backend contracts:

- It calls `serviceComplaints.list` with `outletId`, but backend `list` does not accept `outletId`.
- It creates line payloads with `description`, `serial`, `qty`, and optional `sku`; backend expects `serialNumber`, optional `productId`, and optional `notes`.
- It attempts outlet-raised complaint creation, but backend rejects non-internal actors.

This outlet complaint implementation is currently dead/orphaned UI plus broken API contract.

## Verification Results

Commands run from this worktree:

| Command | Result |
|---|---|
| `bun run typecheck` in `backend` | Pass |
| `npm run build` in `web` | Pass, with Vite chunk-size warning |
| `flutter analyze` in `mobile/service_mobile_app` | Fails policy due 3 analyzer issues, but no compile-blocking errors |
| `bun test src/trpc/routes/service-idor.test.ts src/trpc/routes/service-forms-validation.test.ts src/trpc/routes/service-shared.test.ts` in `backend` | 16 pass, 15 fail |

Backend test failure detail:

- `service-shared.test.ts`: all 9 checks pass.
- `service-forms-validation.test.ts`: all 7 checks pass.
- `service-idor.test.ts`: all 15 checks fail with `UNAUTHORIZED` instead of expected `NOT_FOUND`, `FORBIDDEN`, or `BAD_REQUEST`.

Likely cause by inspection: the fake auth user in `service-idor.test.ts` lacks `isActive: true`, while current `authMiddleware` rejects inactive/missing-active users. The implementation may be correct, but the test fixture is stale and currently not useful as a regression gate.

## Production Readiness Rating

Current complaints module readiness: **6/10 for internal web-first operation**, **3/10 for full production module readiness**.

Why 6/10 for internal web:

- Core web/backend lifecycle exists.
- Form-backed test submission exists.
- Warranty and replacement orchestration exists.
- RBAC is more granular than before.
- Typecheck and web build pass.

Why not higher:

- Fulfillment is blocked for normal web-created complaints without product IDs.
- Assignment has overlapping status-only and assignment-history paths.
- Service tests are partially stale.
- Org context remains header-driven.
- Some lifecycle actions are policy-ambiguous.

Why 3/10 full module:

- Service mobile app is placeholder-only.
- Outlet mobile complaints are not registered and are backend-incompatible.
- Machine integrations do not have real business submission routes.
- Stock adjustment and attachment evidence remain unresolved production gates.

## Recommended Fix Order

1. Choose the complaint creator model:
   - internal-only web complaints, or
   - outlet-raised complaints with own-outlet scoping.

2. If outlet complaints are in scope, add a dedicated outlet-safe path:
   - either `outletPortal.createComplaint/listComplaints`, or
   - extend `serviceComplaints` with explicit outlet actor scoping.

3. Remove the duplicate assignment transition path:
   - make `serviceAssignments.assign/reassign` the only assignment path,
   - remove or block `serviceComplaints.transition({ action: "assign" })`.

4. Add complaint-line product resolution/editing:
   - capture productId in web create, or
   - add a scoped line update route and UI,
   - otherwise replacement fulfillment remains blocked.

5. Fix the stale service IDOR tests:
   - add `isActive: true` to the fake auth user,
   - assert the intended route-level `NOT_FOUND`/`FORBIDDEN` behavior again.

6. Decide the org-context source:
   - derive orgId server-side from user/session/role context, or
   - explicitly document and harden a trusted org header boundary.

7. Gate mobile claims:
   - keep `mobile/service_mobile_app` marked scaffold-only until real queue/detail/form/test flows exist,
   - do not expose outlet complaint pages until routes and backend contracts are fixed.

8. Close remaining production gates:
   - service evidence attachments,
   - replacement stock adjustment,
   - serial-event org scoping,
   - machine scoped business APIs if integrations are part of launch.

## Bottom Line

For the upcoming service/frontend changes, treat the current internal web console as the primary implementation path, but do not build more features on top of the outlet mobile complaint path or the service mobile app scaffold without first fixing their contracts. The next production-hardening change should focus on complaint creation/line product resolution and eliminating the duplicate assignment path, because those directly affect whether a complaint can move cleanly from creation to fulfillment.
