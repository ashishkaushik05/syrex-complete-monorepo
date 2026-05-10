# Mobile Implementation Plan (Outlet Owner Template)

## Goal
Execute a phased, low-risk delivery for a production-ready Flutter template with stable auth and shared query client foundations.

## Scope
- Build and validate template foundation first.
- Integrate one representative module path before scaling to other modules.
- Maintain one implementation path per core behavior.

## Team Inputs Required Before T0 Start
- Confirm Flutter/Dart versions.
- Confirm backend base URLs by environment.
- Confirm auth token TTL assumptions.
- Confirm minimal permission list for first mobile release.

## Milestone Plan

### T0: Foundation Scaffold
Deliverables:
- Flutter app scaffold with agreed folder architecture
- environment config wiring (`dev`, `staging`, `prod`)
- shared lint + formatting configuration
- CI basics (analyze + test)

Exit Criteria:
- app runs on Android + iOS simulators
- static analysis clean
- baseline smoke test green

### T1: Auth + Session Core
Deliverables:
- login/logout/me/refresh integrations
- secure token storage implementation
- session controller and state machine
- route guards with authenticated redirects

Validation:
- login success path
- app relaunch session restore path
- forced logout path
- refresh-failure path

Exit Criteria:
- all auth paths deterministic
- no duplicate auth implementations in codebase

### T2: Shared Network + Query Core
Deliverables:
- centralized dio client + interceptors
- refresh lock and single retry policy
- unified error normalization
- reusable query/mutation helper layer
- scoped cache invalidation helpers

Validation:
- 401 refresh replay success
- concurrent 401 burst behavior
- mapped error rendering

Exit Criteria:
- all API calls use shared client
- no module-local HTTP clients

### T3: App Shell + Dashboard
Deliverables:
- post-login shell
- module-aware navigation
- permission-aware menu and actions
- global loading/error components

Validation:
- permission-specific UI behavior
- unauthenticated redirect handling

Exit Criteria:
- shell supports plugging future modules without core changes

### T4: First Module Slice (Sales Pilot)
Deliverables:
- one end-to-end module slice (list + detail + mutation)
- use shared query/mutation infrastructure only
- permission-gated actions

Validation:
- list caching behavior
- mutation invalidation behavior
- role/permission behavior with real backend responses

Exit Criteria:
- module integration pattern proven and documented

### T5: Accounts + Dispatch Enablement
Deliverables:
- module stubs upgraded into real features
- shared component reuse across modules
- cross-module navigation consistency

Exit Criteria:
- all module routes on single shell
- no duplicate infra code

### T6: Hardening and Release Prep
Deliverables:
- error handling hardening
- performance pass
- analytics/logging pass
- QA checklist and release candidate

Exit Criteria:
- agreed QA pass rate
- production config validated

## Work Breakdown (Detailed)

## A. Foundation Workstream
- create project scaffold
- set lint and quality gates
- define environments and config loader
- initialize dependency graph/providers

## B. Auth Workstream
- implement auth DTOs
- implement auth repository
- implement token store
- implement session controller + notifier
- wire route guards

## C. Network/Query Workstream
- define HTTP client factory
- implement request/response interceptors
- implement refresh coordinator
- implement base query helpers
- implement cache invalidation map

## D. UI Shell Workstream
- splash + auth gate screens
- login screen
- dashboard shell
- reusable loading/error components

## E. Module Workstream
- define module interface contract
- implement Sales pilot module
- replicate pattern for Accounts and Dispatch

## Risks and Mitigations
- Risk: backend auth payload changes.
  - Mitigation: freeze mobile-backend auth contract before T1.
- Risk: token refresh race conditions.
  - Mitigation: enforce single refresh lock and replay queue.
- Risk: infra duplication across modules.
  - Mitigation: code ownership and PR check on core imports.
- Risk: permission mismatch across web/mobile.
  - Mitigation: reuse same permission string format (`module:action`).

## Quality Gates Per PR
- `flutter analyze` passes
- unit/integration/widget tests for changed scope pass
- no direct Dio instantiation outside `core/network`
- no token persistence outside secure storage adapter

## Test Plan
- Unit tests for session controller and error mapper
- Unit tests for permission helpers
- Integration tests for auth lifecycle
- Widget tests for route guards and shell behavior
- Golden tests optional for critical reusable widgets

## Deliverable Artifacts
- Architecture doc
- Mobile implementation plan
- Auth flow sequence notes
- Query key and invalidation registry
- Module integration checklist

## Ownership Model
- Core infra owner: mobile platform track
- Module owners: domain tracks (sales/accounts/dispatch)
- Integration sign-off: mobile lead + backend lead

## Definition of Done (Template Phase)
- Auth, network, and query clients are production-usable
- Sales pilot demonstrates reusable module pattern
- Accounts/Dispatch integration path is documented and ready
- No dead or alternate core implementation paths exist
