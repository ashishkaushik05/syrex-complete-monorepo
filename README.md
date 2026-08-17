# Syrex Operations Platform

Syrex is an end-to-end distribution, warehouse, accounts, field-force, and service-management platform for a battery distribution business. It replaces spreadsheet and chat-based operations with one governed system for outlets, orders, dispatches, stock, GST-aware GRNs and invoices, payments, field activity, service complaints, attachments, warranty flows, and customer/self-service portals.

The repository is intentionally plan-driven. Non-trivial changes must be scoped and logged before implementation so the project does not accumulate mixed, partial, or parallel behavior paths.

## Product Surfaces

| Surface | Path | Purpose |
|---|---|---|
| Backend API | `backend/` | Bun + Hono + tRPC API, Prisma persistence, RBAC, cron jobs, object storage, service-client integration, and direct health/SSE endpoints. |
| Admin Web App | `web/` | React/Vite dashboard for internal users managing catalog, outlets, orders, dispatches, inventory, GRNs, invoices, payments, field operations, and service workflows. |
| Service Portal | `service-portal/` | Standalone customer-facing portal for complaint creation, tracking, and attachment flows through customer-safe API projections. |
| Outlet Mobile App | `mobile/outlet_app/` | Flutter outlet-facing app for outlet workflows such as catalog, cart/order, checkout, dispatch history, invoice views, and portal-like access. |
| Sales Mobile App | `mobile/sales_mobile_app/` | Flutter field-sales app with GPS/field activity capabilities, secure API access, and offline-oriented dependencies. |
| Service Mobile App | `mobile/service_mobile_app/` | Flutter ASI/service-engineer app for service assignments, diagnosis, form capture, image evidence, and test workflows. |
| Planning Docs | `plan/` | Architecture, release plans, decision logs, API contracts, audits, testing notes, and module-specific source-of-truth documents. |
| Client Docs | `client-docs/` | HTML overview, feature matrix, glossary, and flowchart-style client reference material. |

## Core Domains

- **Identity and permissions:** users, roles, invitations, actor context, service-client auth, and `resource:action` RBAC permissions.
- **Catalog:** brands, categories, products, SKU metadata, product images, tax fields, active/inactive state, and demand signals.
- **Outlets and warehouses:** outlet profiles, assigned warehouse behavior, warehouse stock, warehouse managers, and billing-profile assignment.
- **Orders and dispatch:** sale orders, order lines, approval/hold/rejection transitions, dispatch creation, in-transit/delivery state, dispatch line serials, and timeline history.
- **Inventory and GRN:** stock adjustments, goods receipts, production/warehouse receiving, GST calculation, immutable receipt/invoice snapshots, reversals, replacements, and movement history.
- **Accounts:** invoices, invoice lines, charges, outlet payments, allocations, reversals, receivables, and account statements.
- **Field Sense:** shifts, field locations, visit logs, stops, schedules, attendance, sync status, analytics, retention jobs, and live SSE location streaming.
- **Service module:** complaints, complaint lines, assignment history, forms, service tests, serial checks, warranty flows, service analytics, integrations, customer portal auth, and attachments.
- **Attachments and storage:** presigned object-storage uploads using canonical `OBJECT_STORAGE_*` variables with compatibility fallback for legacy `MINIO_*` development settings.

## Repository Layout

```text
.
├── backend/                 # Bun + Hono + tRPC backend
├── web/                     # React + Vite internal dashboard
├── service-portal/          # React + Vite customer service portal
├── mobile/
│   ├── outlet_app/          # Flutter outlet mobile app
│   ├── sales_mobile_app/    # Flutter sales / field-force app
│   └── service_mobile_app/  # Flutter service-team app
├── plan/                    # Architecture, releases, API specs, audits, decisions
├── client-docs/             # Client-facing HTML documentation
├── warehouse_csvs/          # Import/migration source files and catalog CSVs
├── scripts/                 # Deployment/log helper scripts
└── schema.prisma            # Single Prisma schema for the full platform
```

## Technology Stack

| Layer | Stack |
|---|---|
| Backend runtime | Bun, Hono, tRPC v11, SuperJSON |
| Database | PostgreSQL through Prisma |
| Validation | Zod and Prisma constraints |
| Web apps | React 19, Vite, TypeScript, React Router, TanStack Query, Tailwind/shadcn-style UI primitives |
| Mobile apps | Flutter, Riverpod, GoRouter, Dio, secure storage |
| Storage | S3-compatible object storage, including local MinIO-compatible development config |
| Realtime | Server-Sent Events for field live-streaming |
| Documentation | OpenAPI 3.1 contract, decision logs, module plans, client HTML docs |

## Backend Architecture

The backend is mounted from `backend/src/index.ts`. The Hono app exposes direct endpoints such as `/health`, `/ready`, and `/field/live-stream`, then mounts tRPC procedures under `/trpc`.

Request flow:

1. A bearer-token middleware resolves the user session and forwards actor metadata into request headers.
2. tRPC context construction reads actor and organization data, loads permissions, and attaches Prisma.
3. `protectedProcedure` requires an authenticated actor.
4. `perm("resource:action")` gates domain procedures through RBAC.
5. Domain routers are composed in `backend/src/trpc/router.ts`.

Important mounted router namespaces include:

```text
accounts, attachments, auth, brands, categories, dispatches, fieldAnalytics,
fieldAttendance, fieldLocation, fieldSchedule, fieldShifts, fieldStops,
fieldSyncStatus, fieldVisits, images, inventory, invoices, invitations,
orders, outletPortal, outlets, payments, products, roles, serviceAnalytics,
serviceAssignments, serviceComplaints, serviceForms, serviceIntegrations,
servicePortal, serviceSerials, serviceTests, serviceWarranty, skuDemand,
system, taxCharges, orgBillingProfile, users, warehouses
```

## Prerequisites

- Bun
- Node.js/npm for the Vite apps
- Flutter SDK for mobile apps
- PostgreSQL
- S3-compatible object storage if exercising attachment upload flows
- Prisma client generated from the root `schema.prisma`

## Environment

Backend configuration is read from `backend/.env` or equivalent runtime variables.

Minimum backend variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/syrex
PORT=3000
NODE_ENV=development
```

Optional service and storage variables:

```env
SERVICE_PORTAL_JWT_SECRET=replace-with-at-least-32-characters
OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=syrex
OBJECT_STORAGE_ACCESS_KEY_ID=minioadmin
OBJECT_STORAGE_SECRET_ACCESS_KEY=minioadmin
OBJECT_STORAGE_FORCE_PATH_STYLE=true
```

Legacy local MinIO variables such as `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` are normalized by the backend when explicit `OBJECT_STORAGE_*` variables are absent.

## Setup

Install dependencies per app directory. There is no root package manifest for all workspaces.

```bash
cd backend
bun install
bun run prisma:generate
```

```bash
cd web
npm install
```

```bash
cd service-portal
npm install
```

```bash
cd mobile/outlet_app
flutter pub get
```

```bash
cd mobile/sales_mobile_app
flutter pub get
```

```bash
cd mobile/service_mobile_app
flutter pub get
```

## Database

The root Prisma schema is `schema.prisma`. Backend scripts already point Prisma at that schema.

Development reset and seed:

```bash
cd backend
bun run db:prepare
```

This runs a destructive reset and demo seed. Use it only for local development data.

Useful backend database commands:

```bash
cd backend
bun run prisma:generate
bun run db:reset
bun run db:seed
```

## Run Locally

Backend:

```bash
cd backend
bun dev
```

Admin web app:

```bash
cd web
npm run dev
```

Service portal:

```bash
cd service-portal
npm run dev
```

Flutter apps:

```bash
cd mobile/outlet_app
flutter run --dart-define=BASE_URL=http://10.0.2.2:3000
```

```bash
cd mobile/sales_mobile_app
flutter run --dart-define=BASE_URL=http://10.0.2.2:3000
```

```bash
cd mobile/service_mobile_app
flutter run --dart-define=BASE_URL=http://10.0.2.2:3000
```

Use `http://10.0.2.2:3000` for Android emulator access to a host backend. Use the host machine IP for a physical Android device on the same network.

## Verification

Backend:

```bash
cd backend
bun run typecheck
bun test
bun run rbac:preflight
```

Admin web:

```bash
cd web
npm run build
npm run lint
```

Service portal:

```bash
cd service-portal
npm run build
npm run lint
npm test
```

Flutter apps:

```bash
cd mobile/outlet_app
flutter analyze
flutter test
```

```bash
cd mobile/sales_mobile_app
flutter analyze
flutter test
```

```bash
cd mobile/service_mobile_app
flutter analyze
flutter test
```

## API Documentation

Backend API documentation lives under `plan/api-spec/`.

- `plan/api-spec/README.md` explains coverage and document structure.
- `plan/api-spec/openapi.yaml` is the OpenAPI 3.1 artifact.
- `plan/api-spec/BACKEND_EXPLORATION_LOG.md` records source-reading batches.
- `plan/api-spec/02-ENDPOINT_CATALOG.md` catalogs mounted endpoints and procedure behavior.

The API is primarily tRPC over HTTP. OpenAPI paths model the RPC transport rather than pretending the backend is a conventional REST service.

## Decision Logging Contract

This repository requires decision logging for non-trivial work.

Mandatory sources:

- `plan/ai-governance/decision-log/DECISION_PROTOCOL.md`
- `plan/ai-governance/decision-log/DECISION_TEMPLATE.md`
- `plan/ai-governance/decision-log/DECISION_LOG.md`

Required workflow:

1. Create or update a decision entry before code edits.
2. Define exact scope before implementation.
3. Update the same decision entry after work.
4. If work is partial or blocked, document done/not-done items, dead paths, conflicting behavior, cleanup actions, and owner.

Architecture rule: keep one primary implementation path per behavior. Do not leave old and new paths active without a logged migration reason.

## Important Plan Areas

- `plan/DASHBOARD.md` - high-level project status dashboard.
- `plan/service-module/` - service workflow plans, releases, portal, mobile, and state-driven UI design.
- `plan/mobile/` - mobile app planning.
- `plan/field-module/` - Field Sense planning.
- `plan/accounts/` - accounts, payments, invoices, and related finance plans.
- `plan/dispatch/` - dispatch and warehouse movement planning.
- `plan/audit/` and `plan/service-audit/` - audit reports and implementation reviews.
- `plan/decisions/` - per-module decision logs.

## Development Notes

- The root `schema.prisma` is authoritative for all apps.
- Prefer backend route tests for business rules and frontend/mobile tests for workflow presentation.
- Permission keys should follow the established `resource:action` convention.
- Attachment flows rely on presigned uploads and must avoid exposing storage credentials to clients.
- Customer-facing portal responses must stay safe projections and should not expose staff-only diagnostics, raw internal notes, or private storage keys.
- When changing schema, regenerate Prisma before typechecking.
- Keep documentation and implementation aligned; update `plan/` documents when behavior changes.

## Current Scope Boundaries

The repository contains active release work and historical planning. Treat current source files, the decision log, and the API spec as the live authority. Older plans and archived decisions are useful context but should not be treated as proof that a feature is complete without checking code, tests, and the latest decision entry.
