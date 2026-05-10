# Outlet Owner Flutter Template Plan

## Goal
Build a reusable Flutter application template that can be adapted into multiple business apps (Sales, Accounts, Dispatch, etc.) while keeping shared authentication, API client, and query caching behavior consistent.

## Core Principles
- Single foundation, multiple feature packs.
- One auth implementation path (no parallel auth flows).
- One API/query client path for all modules.
- Feature modules should plug in without changing core infrastructure.

## Template Scope (Phase T0)
- App bootstrap and environment config (`dev`, `staging`, `prod`).
- Auth foundation:
  - login
  - refresh token handling
  - logout
  - boot-time session restore
  - role + permission state
- Shared API foundation:
  - typed request/response models
  - central HTTP client with interceptors
  - automatic token injection
  - automatic refresh + retry once on 401
- Shared query foundation:
  - centralized query client
  - caching defaults
  - query/mutation error mapping
  - invalidation helpers
- App shell:
  - authenticated route guard
  - module-aware navigation shell
  - global loading and error surfaces

## Proposed Flutter Stack
- State: `riverpod` + `flutter_riverpod`
- Routing: `go_router`
- Networking: `dio`
- Query caching: `riverpod` async providers (template-native) with reusable query helper layer
- Secure token storage: `flutter_secure_storage`
- Models/serialization: `freezed` + `json_serializable`
- Logging/inspection: `logger`

## Folder Blueprint
- `mobile/outlet_owner_template/`
- `lib/app/`
  - `bootstrap/` (env, app init)
  - `router/` (guards + route graph)
  - `theme/`
- `lib/core/`
  - `auth/` (session manager, token lifecycle)
  - `network/` (dio client, interceptors)
  - `query/` (cache policy, query helpers)
  - `storage/` (secure/local storage adapters)
  - `errors/` (api/app error mapping)
  - `permissions/` (permission checks)
- `lib/modules/`
  - `auth/` (ui + application use-cases)
  - `dashboard/` (post-login shell)
  - `sales/` (stub feature)
  - `accounts/` (stub feature)
  - `dispatch/` (stub feature)
- `lib/shared/`
  - `widgets/`
  - `models/`
  - `utils/`

## Auth Contract Alignment (Current Backend)
Use backend routes already available in this repository:
- `auth.login`
- `auth.refresh`
- `auth.logout`
- `auth.me`

Required client behaviors:
- Store access + refresh tokens securely.
- Attach access token on all protected requests.
- On 401:
  - try `auth.refresh` once
  - retry original request once
  - if refresh fails, force logout and redirect to login.
- Hydrate user profile (`role`, `permissions`, `managedWarehouseId`) at app launch.

## Query Client Standards
- Default stale time for list/query screens: 60s.
- Mutation success must trigger scoped invalidation (not global cache wipe).
- Normalize API errors into a single app error model:
  - `UNAUTHORIZED`
  - `FORBIDDEN`
  - `VALIDATION`
  - `CONFLICT`
  - `SERVER`
- Add request ID extraction for support/debug display.

## Reusability Strategy (How this becomes Sales/Accounts/Dispatch apps)
- Keep core (`app`, `core`, `shared`) unchanged across all apps.
- Each business app controls:
  - enabled module registry
  - nav configuration
  - branding/theme overrides
  - permission map per module
- Feature packaging approach:
  - template ships module stubs
  - each target app replaces stubs with full screens/use-cases.

## Build Order
1. T0: Template foundation (auth + network + query + guarded shell)
2. T1: Sales module integration
3. T2: Accounts module integration
4. T3: Dispatch module integration
5. T4: Cross-module analytics + offline improvements

## Done Criteria for T0
- App launches and resolves session state reliably.
- Login/logout/refresh/me flow works end-to-end.
- Protected routes are inaccessible without valid session.
- At least one authenticated sample screen fetches data through shared query layer.
- No duplicate auth or API client code path exists.

## Detailed References
- Architecture detail: `plan/FLUTTER_OUTLET_OWNER_TEMPLATE_ARCHITECTURE.md`
- Delivery plan detail: `plan/mobile/MOBILE_IMPLEMENTATION_PLAN.md`
