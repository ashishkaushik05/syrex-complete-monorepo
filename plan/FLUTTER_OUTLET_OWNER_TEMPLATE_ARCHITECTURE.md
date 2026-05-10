# Flutter Outlet Owner Template Architecture (Detailed)

## 1. Purpose
Define a reusable Flutter base application for the Outlet Owner domain that can be productized into multiple app variants:
- Sales app
- Accounts app
- Dispatch app
- Combined multi-module app

This document is the architecture contract for the template foundation before coding begins.

## 2. Non-Negotiable Architecture Rules
- Single auth path only. No alternate login/session management implementations.
- Single API client path only. No module-local HTTP clients.
- Single query/cache path only. No ad-hoc API state in UI widgets.
- Feature modules are plug-ins over shared core, not independent app stacks.
- Permission enforcement in UI is advisory; backend remains source of truth.

## 3. Backend Contract Baseline
Current backend contract from this repository (tRPC routes):
- `auth.login`
- `auth.refresh`
- `auth.logout`
- `auth.me`

Expected auth payload surface (minimum):
- access token
- refresh token
- user profile
- role
- permissions
- `managedWarehouseId` (when applicable)

If backend contracts change, this plan must be revised before scaffold execution.

## 4. Tech Stack Standard
- Flutter: stable channel
- State & DI: `flutter_riverpod`
- Routing & guards: `go_router`
- HTTP client: `dio`
- Serialization: `freezed`, `json_serializable`
- Secure storage: `flutter_secure_storage`
- Logging: `logger`
- Linting: `flutter_lints` + repo custom rules

## 5. Project Structure Contract
Root proposal:
- `mobile/outlet_owner_template/`

Within `lib/`:
- `app/`
  - `bootstrap/` app startup, env binding, crash setup
  - `router/` route map + guards + redirect logic
  - `theme/` core design tokens and app theming
- `core/`
  - `auth/` token/session manager, auth repository, auth providers
  - `network/` dio builders, interceptors, request options
  - `query/` reusable async query/mutation helpers and cache policies
  - `storage/` secure/local storage adapters
  - `errors/` app error types and API error normalization
  - `permissions/` permission primitives and helpers
  - `config/` environment, base URL, feature flags
- `modules/`
  - `auth/` login/logout screens + use cases
  - `dashboard/` post-login shell
  - `sales/` stub module
  - `accounts/` stub module
  - `dispatch/` stub module
- `shared/`
  - `widgets/` reusable UI components
  - `models/` generic view models
  - `utils/` shared pure helpers

## 6. Environment Strategy
Environments:
- `dev`
- `staging`
- `prod`

Per-environment configuration:
- API base URL
- request timeout policy
- log verbosity
- optional feature flags

Injection rules:
- compile-time flavor + runtime-safe config reader
- no hardcoded URL in feature modules

## 7. Authentication Architecture
Components:
- `TokenStore`
  - persists access/refresh in secure storage
- `AuthApi`
  - server calls for login/refresh/logout/me
- `SessionController`
  - single source for session state machine
- `AuthGuard`
  - route-level protection based on session state

Session states:
- `unknown` (cold start)
- `authenticated`
- `unauthenticated`
- `refreshing`
- `expired`

Required flows:
1. App boot:
- load tokens
- if missing => unauthenticated
- if present => call `auth.me`
- on me success => authenticated
- on me 401 => try refresh once
2. Login:
- call login
- persist tokens
- fetch me
- set authenticated
3. Background token expiry:
- interceptor catches 401
- enqueue one refresh attempt
- replay failed request once
- if refresh fails => clear session and redirect login
4. Logout:
- best-effort server logout
- local token clear always
- invalidate user-scoped caches

## 8. Network Layer Contract
`Dio` setup must provide:
- auth header injection from `TokenStore`
- request correlation ID propagation when available
- response error normalization to app-level errors
- refresh orchestration lock (avoid parallel refresh storms)

Retry policy:
- refresh-based retry only once per request on 401
- no blind retries for 4xx validation errors
- optional bounded retry for transient 5xx/network failures

## 9. Query Layer Contract
Use Riverpod async abstractions with a thin standard layer:
- `QueryKey` conventions (`module/entity/action/params`)
- cache metadata (`staleAt`, `fetchedAt`, error state)
- explicit invalidation helpers (scoped)

Default policies:
- list/query stale window: 60 seconds
- detail query stale window: 30 seconds
- no global cache wipe for single-entity mutation

Mutation pattern:
- optimistic update only where rollback logic exists
- otherwise write-through with targeted refetch

## 10. Error & Observability Model
Normalize backend errors into one enum/class family:
- `unauthorized`
- `forbidden`
- `validation`
- `conflict`
- `notFound`
- `network`
- `server`
- `unknown`

Each normalized error should include:
- user-facing message
- developer message
- backend error code
- backend request ID (if present)

Observability minimum:
- structured logs for auth transitions
- structured logs for refresh attempts/outcomes
- error boundary surface for fatal module errors

## 11. Permissions and Module Access
Authorization model in app:
- permissions array and wildcard support
- helper: `can(permission)`
- helper: `canAny([...])`
- helper: `canAll([...])`

UI behavior:
- hide/disable guarded actions
- still let backend decide final authorization

Module registry gates:
- module may be enabled by build config
- module actions may be gated by permissions

## 12. App Shell and Navigation
Post-login shell responsibilities:
- dynamic menu from enabled modules + permission checks
- global app bar and session status indicator
- centralized snackbars/errors

Routing rules:
- unauthenticated users always redirected to login
- authenticated users blocked from revisiting login unless explicit switch-account path
- unknown state shows splash/loading gate

## 13. Security Baseline
- tokens only in secure storage
- never log token values
- wipe session on refresh compromise
- optional inactivity logout policy (phase extension)
- certificate pinning considered for production hardening

## 14. Testing Contract for Template Foundation
Unit tests:
- token storage adapter
- session state machine transitions
- permission helpers
- error normalization

Integration tests:
- login -> me -> authenticated route entry
- expired access token -> refresh -> request replay
- refresh failure -> forced logout

Widget tests:
- route guard transitions
- login form states
- permission-based UI visibility

## 15. Extension Path (Sales/Accounts/Dispatch)
Per-app customization points:
- app name, branding, theme
- enabled module list
- module-specific route subtree
- module permission mapping

Immutable shared points:
- auth pipeline
- network client
- error normalization
- query conventions

## 16. Phase-0 Acceptance Criteria
Template architecture is ready for coding when:
- all module boundaries are frozen
- auth lifecycle is approved
- query/cache conventions are approved
- environment strategy is approved
- testing contract is approved

## 17. Explicit Out-of-Scope (Current Planning)
- Offline-first sync engine
- Push notifications
- Deep analytics instrumentation
- Full module business workflows
- Store publishing pipeline
