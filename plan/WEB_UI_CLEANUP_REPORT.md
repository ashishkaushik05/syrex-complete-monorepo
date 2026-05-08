# Web UI Cleanup Report (API Reset)

## Goal
Remove Field/Service-oriented UI and other non-core screens while the API is being redesigned, keeping only sales, dispatch, catalog, accounts, users/roles, outlets, and notifications.

## Scope Decision
Keep now:
- Core: overview, notifications
- Sales: outlets, orders, dispatches, reports
- Accounts: invoices, approvals, AR aging, outstanding, payments
- Catalog: brands, categories, skus
- Dispatch: queue/runs/warehouses/assignment
- Admin: users, roles

Remove now (can be reintroduced later):
- Field Sense screens and APIs
- Service/Tickets/Warranty screens and APIs
- Legacy service/distribution redirect routes
- Field capability toggles in user management/auth context
- Unused dashboard screens not linked from routing

## Removal Matrix

### 1) Routes and Page Imports
Primary file:
- `web/src/App.tsx`

Remove imports and routes:
- `MapPage`, `TicketsPage`, `WarrantyManagePage`, `FieldSchedulePage`, `AttendancePage`, `FieldAssignmentsPage`
- Routes:
  - `/dashboard/map`
  - `/dashboard/tickets`
  - `/dashboard/service/warranty`
  - `/dashboard/field-schedule`
  - `/dashboard/attendance`
  - `/dashboard/field-assignments`
  - legacy redirects:
    - `/dashboard/service/catalog/*`
    - `/dashboard/service/assets`
    - `/dashboard/distribution/*`

### 2) Sidebar + Breadcrumb Cleanup
Primary file:
- `web/src/pages/dashboard/DashboardLayout.tsx`

Remove:
- Sections: `Field Sense`, `Service`
- Nav entries:
  - Live Map
  - Visit Assignments
  - Field Schedule
  - Attendance
  - Tickets
  - Warranty
- Breadcrumb logic for:
  - `/dashboard/map`
  - `/dashboard/field-assignments`
  - `/dashboard/tickets`
  - `/dashboard/service/warranty`
- `sectionColors` entries for removed sections
- `fieldSenseEnabled` gating logic for hidden nav entries

### 3) API References to Remove From Web
Remove calls to unsupported endpoints:
- `/field/*`
- `/tickets*`
- service-warranty ticket workflows

Known files:
- `web/src/pages/dashboard/MapPage.tsx`
- `web/src/pages/dashboard/FieldSchedulePage.tsx`
- `web/src/pages/dashboard/AttendancePage.tsx`
- `web/src/pages/dashboard/FieldAssignmentsPage.tsx`
- `web/src/pages/dashboard/TicketsPage.tsx`
- `web/src/pages/dashboard/WarrantyManagePage.tsx`
- `web/src/pages/dashboard/OverviewPage.tsx` (remove ticket/field cards and feed)
- `web/src/lib/notifications.ts` (remove ticket-specific target path rules)

### 4) Field Capability Model Cleanup
Files:
- `web/src/hooks/useAuth.ts`
- `web/src/pages/dashboard/UsersPage.tsx`
- `web/src/components/UserTable.tsx`

Remove:
- `fieldSenseEnabled` capability from auth context return shape
- Field Sense toggle UI in user details/edit flows
- Field Sense badge/columns from user tables

### 5) Delete Unused/Orphan Screens
Currently present but not routed from `App.tsx`:
- `web/src/pages/dashboard/PlanningOverviewPage.tsx`
- `web/src/pages/dashboard/OrgPage.tsx`
- `web/src/pages/dashboard/PlatesPage.tsx`
- `web/src/pages/dashboard/BatteryWipPage.tsx`
- `web/src/pages/dashboard/DispatchQueueMetricsPage.tsx`
- `web/src/pages/dashboard/RawMaterialsPage.tsx`
- `web/src/pages/dashboard/ProductionPlanPage.tsx`
- `web/src/pages/dashboard/TomorrowDispatchQueuePage.tsx`
- `web/src/pages/dashboard/ServiceAssetsPage.tsx`

Action:
- Delete files now, or move to `web/src/pages/_deprecated/` for short-term rollback.

## Recommended Execution Plan

### Phase 1: Hard-hide and stabilize routing (low risk)
1. Remove route entries/imports in `App.tsx`.
2. Remove sidebar entries + breadcrumb branches in `DashboardLayout.tsx`.
3. Keep removed pages on disk temporarily for one commit for quick rollback.

### Phase 2: Remove data dependencies (medium risk)
1. Strip field/ticket widgets from `OverviewPage.tsx`.
2. Remove ticket mapping from `lib/notifications.ts`.
3. Remove `fieldSenseEnabled` references from `useAuth.ts`, `UsersPage.tsx`, `UserTable.tsx`.

### Phase 3: Physical deletion (medium risk)
1. Delete service/field page files.
2. Delete orphan dashboard pages listed above.
3. Remove dead imports/types after TS compile check.

### Phase 4: Verification and polish
1. Run `npm run build` and `npm run lint` in `web/`.
2. Manual nav QA:
   - Desktop/mobile sidebar
   - Breadcrumbs
   - Notifications navigation
   - 404/unknown route fallback behavior
3. Confirm no requests to `/field/*` or `/tickets*` in network logs.

## Risk Notes
- `OverviewPage` currently blends core metrics with field/ticket metrics; removing those needs careful UI rebalance to avoid empty sections.
- Removing ticket targets in notifications may require fallback routing for historical notifications.
- If backend still returns `fieldSenseEnabled`, frontend should ignore it safely after type cleanup.

## Rollback Strategy
- Commit per phase with small diffs.
- Keep one temporary tag/branch before physical file deletion.
- If needed, re-enable by restoring Phase 1 commit only (routes/nav) without restoring old API calls.

## Suggested Deliverables
- PR 1: Routing + Sidebar cleanup
- PR 2: Overview/Auth/User cleanup
- PR 3: File deletions + dead-code cleanup + QA checklist signoff
