# Field Sense Stabilization And Production Rollout

## Purpose

This folder is the canonical planning package for the Field Sense stabilization phase.
It converts the verified rollout direction into durable implementation documentation for
mobile, backend, web supervisor tools, sync operations, QA, and production monitoring.

The goal is to move Field Sense from feature-complete pieces into one production runtime:

- one mobile state owner
- one repository and local persistence layer
- one offline sync pipeline
- one navigation flow
- one backend contract layer
- one supervisor operations model

## Current Verified Position

Backend is the canonical contract layer. The production mobile path must build against
the V2 contracts already present in the backend:

- `fieldShifts.syncStart`
- `fieldLocation.ingestV2`
- `fieldShifts.syncEnd`
- `fieldSyncStatus.upsert`
- `fieldLocation.activeAgents`

The sales mobile app already has Field routes, Field tab gating, and a shift flow that
uses `syncStart` and `syncEnd`. It is not yet production-grade offline-first because
runtime ownership is split and point persistence still uses secure-storage JSON queueing.

The web dashboard has live map, schedule, attendance, shifts, visits, and stops pages,
but it still needs operational health surfaces, pagination, `activeAgents.hasMore`
handling, permission alignment, and removal of placeholder REST compatibility paths.

## Documentation Map

- [REQUIREMENTS.md](./REQUIREMENTS.md): functional, non-functional, permission, and acceptance requirements.
- [PHASED_ROLLOUT_PLAN.md](./PHASED_ROLLOUT_PLAN.md): phased execution plan with team ownership and gates.
- [ARCHITECTURE.md](./ARCHITECTURE.md): target architecture, ownership boundaries, and data flow.
- [MOBILE_CANONICAL_RUNTIME.md](./MOBILE_CANONICAL_RUNTIME.md): sales mobile runtime design and migration rules.
- [BACKEND_CONTRACTS.md](./BACKEND_CONTRACTS.md): backend contract reference and reliability requirements.
- [SUPERVISOR_OPERATIONS.md](./SUPERVISOR_OPERATIONS.md): web supervisor operations dashboard and live map plan.
- [OFFLINE_SYNC_SPEC.md](./OFFLINE_SYNC_SPEC.md): local store, queue state machine, sync worker, and idempotency.
- [QA_DEVICE_ROLLOUT.md](./QA_DEVICE_ROLLOUT.md): real-device matrix, failure injection, and rollout gates.
- [OBSERVABILITY_SECURITY.md](./OBSERVABILITY_SECURITY.md): logs, metrics, alerts, privacy, auth, and org isolation.
- [IMPLEMENTATION_BACKLOG.md](./IMPLEMENTATION_BACKLOG.md): concrete backlog grouped into implementable slices.

## Critical Rules

1. Do not create parallel Field Sense runtimes.
2. Do not send direct network writes from Field screens.
3. All mobile writes must go through local persistence first.
4. Backend V2 contracts are the source of truth.
5. GPS capture must not depend on network availability.
6. Supervisor tooling must expose operational health, not only historical data.
7. Old routes or compatibility shims may stay only with a logged migration reason.
8. Every implementation slice must update the decision log before and after code changes.

## Active Code Areas

Sales mobile:

- `mobile/sales_mobile_app/lib/modules/field/**`
- `mobile/sales_mobile_app/lib/core/location/**`
- `mobile/sales_mobile_app/lib/core/permissions/**`
- `mobile/sales_mobile_app/lib/app/router/**`

Supervisor web:

- `web/src/pages/dashboard/FieldSense*.tsx`
- `web/src/pages/dashboard/DashboardLayout.tsx`
- `web/src/App.tsx`
- `web/src/lib/api.ts`

Backend:

- `backend/src/trpc/routes/field-shifts.ts`
- `backend/src/trpc/routes/field-location.ts`
- `backend/src/trpc/routes/field-sync-status.ts`
- `backend/src/trpc/routes/field-visits.ts`
- `backend/src/trpc/routes/field-stops.ts`
- `backend/src/trpc/routes/field-attendance.ts`
- `backend/src/trpc/routes/field-schedule.ts`
- `backend/src/trpc/routes/field-helpers.ts`
- `backend/src/app.ts`
- `schema.prisma`

Out of scope unless explicitly requested:

- Deleting `mobile/outlet_owner_template` Field Sense files. Those are not the active
  sales mobile runtime and must not be removed under a sales-mobile cleanup by accident.

## Definition Of Done

Field Sense is production-ready when:

- field agents can start, continue, and end shifts with no network
- every point/event is persisted locally before upload
- sync resumes without duplicates after reconnect, token refresh, restart, or crash
- supervisors see near real-time movement and stale/queue/GPS health
- queue backlog and sync errors are observable
- app restart restores active shift, queue, and capture state
- no duplicate production mobile implementation path remains
- backend logs and metrics can explain failures by org, device, shift, and client ids
- long-running real-device shifts remain stable for at least 8 hours
