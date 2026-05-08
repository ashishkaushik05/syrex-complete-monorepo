# Phase 1 Contract Freeze (Identity + Master Data)

Date: 2026-05-08
Decision Entry: `DEC-20260508-007`

## Frozen Procedure Surface

- `system.conventions` (carried from Phase 0)
- `auth.login`
- `auth.refresh`
- `auth.logout`
- `auth.me`
- `invitations.create`
- `invitations.list`
- `invitations.revoke`
- `invitations.accept`
- `users.list`
- `users.getById`
- `users.create`
- `users.update`
- `roles.list`
- `roles.create`
- `roles.update`
- `brands.list`
- `brands.getById`
- `brands.create`
- `brands.update`
- `categories.list`
- `categories.getById`
- `categories.create`
- `categories.update`
- `products.list`
- `products.getById`
- `products.create`
- `products.update`
- `images.list`
- `images.getById`
- `images.create`
- `images.update`
- `outlets.list`
- `outlets.getById`
- `outlets.create`
- `outlets.update`
- `warehouses.list`
- `warehouses.getById`
- `warehouses.create`
- `warehouses.update`

## Contract Conventions

- Error taxonomy remains: `BAD_REQUEST`, `CONFLICT`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL`.
- tRPC error formatter includes `data.requestId` in all responses.
- `protectedProcedure` now enforces presence of `x-actor-id` for protected routes.
- Pagination contract for list endpoints:
  - input: `{ cursor?: string | null, limit?: number }`
  - output: `{ items: T[], nextCursor: string | null }`
- Decimal transport is string for API payload fields:
  - `products.basePrice`
  - `outlets.creditLimit`
  - `outlets.outstandingBalance`
- Date/time fields are emitted as ISO-8601 UTC strings.
- Auth refresh tokens are now persisted in `auth_sessions` and validated/rotated on `auth.refresh`.

## Validation Executed

- `cd backend && bun run typecheck` passed on 2026-05-08.
- `bash backend/scripts/phase1-smoke.sh` passed on 2026-05-08 (live Postgres force-reset + seed + API + tRPC route sweep).
- Response snapshots captured under `plan/phase-gates/snapshots/phase1_*.json` for all frozen Phase 1 procedures.

## Frontend Alignment Notes

- Frontend can remove Phase 1 auth/master-data mocks and bind screens/forms to the frozen procedures above.
- Protected procedures currently use permissive middleware (RBAC enforcement deferred to Phase 5 by plan).
