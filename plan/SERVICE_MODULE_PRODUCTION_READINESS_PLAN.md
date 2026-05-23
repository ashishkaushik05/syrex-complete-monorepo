# Service Module Production Readiness Plan

## Objective

Make the Service module production-ready as one coherent vertical across backend, web, diagnostic evidence capture, warranty fulfillment, serial intelligence, attachments, machine integrations, and the Service Mobile App.

The production target is not just "routes exist". The target is:

1. A service complaint follows one enforced lifecycle from raise to closure.
2. Diagnostic tests are backed by validated service form submissions and attachments where required.
3. Warranty approval and replacement fulfillment preserve serial, stock, order, dispatch, audit, and invoice invariants.
4. Internal users can operate the workflow from a stable web UI with correct RBAC.
5. Service engineers have a clearly gated mobile release path instead of placeholder scaffold screens.
6. External test-machine integrations have real scoped contracts if enabled.
7. Deployments, storage, migrations, tests, and observability are safe for real customer service data.

## Current Baseline

### Implemented

- Backend service schema exists for:
  - complaints and complaint lines
  - assignment history
  - service test reports
  - complaint activity and audit log writes
  - warranty decisions
  - service serial index and serial events
  - machine clients and audit entries
  - form templates, fields, submissions, and values
- Backend routers exist for:
  - `serviceComplaints`
  - `serviceAssignments`
  - `serviceForms`
  - `serviceTests`
  - `serviceSerials`
  - `serviceWarranty`
  - `serviceIntegrations`
- Service RBAC catalog exists.
- Web pages exist for complaints, complaint detail, serial lookup, warranty queue, and machine-client management.
- Warranty replacement orders are wired into order/dispatch behavior and suppress invoice generation.
- Dispatch delivery can auto-resolve linked replacement complaints.

### Known Production Blockers

- Web test submission still targets the direct test route while backend requires at least one valid service form submission first.
- `assigned` status exists in backend lifecycle but is not consistently represented in web status tabs, detail actions, and assignment behavior.
- Initial assignment and reassignment are not clearly separated in the web workflow.
- The Service Mobile App is still scaffold UI with placeholder login, queue, complaint detail, and test-capture screens.
- Machine-client UI exists, but machine-scoped business APIs are not complete beyond auth probing.
- Attachment pending uploads still use placeholder `uploads.local` URLs instead of real storage signing and readback.
- Serial lookup still performs legacy dispatch scanning in application memory and needs a scale strategy.
- Automated service coverage is mostly transition-unit coverage, not workflow integration coverage.
- Current deploy workflow resets and reseeds the database on every deploy, which is incompatible with production service data.

## Production Scope Decision

### First Production Release Scope

Ship a **web-operated Service module** first:

- service complaint creation and triage
- ASI/SE assignment
- visit and retest lifecycle
- DB-driven diagnostic form capture
- test report submission
- warranty approve/reject
- replacement serial assignment
- replacement order creation and dispatch-driven closure
- serial intelligence lookup
- complaint and service evidence attachments
- auditability and RBAC

### Explicit Release Gates

- Do not claim Service Mobile App production readiness until its mobile scope passes its own release gate.
- Do not claim external machine integration readiness until actual machine-scoped ingestion/submission routes, authentication tests, rate limits, and contract docs are complete.
- Do not retain direct test-submission and form-backed test-submission as equal production paths. Form-backed test submission is the primary path.

## Non-Negotiable Architecture Rules

- Keep one primary implementation path per behavior.
- `ServiceComplaint.status` is the lifecycle source of truth.
- `ServiceComplaintActivity` and audit logs must record service state-changing actions.
- Diagnostic evidence must be modeled through service forms and attachments, not only loose test JSON.
- Test submission must remain blocked until required diagnostic evidence is valid.
- UI action availability must be derived from the same lifecycle rules enforced by backend.
- Warranty fulfillment must not create invoices for zero-value replacement orders.
- Replacement serials must not be linked to more than one active conflicting service replacement path.
- Attachment URLs, confirmation, access, retention, and deletion must use the real storage path before production.
- Any compatibility route retained during migration must have an owner, telemetry, and removal date.

## Target Workflow

### Canonical Complaint Flow

1. Internal user raises complaint with one or more complaint serial lines.
2. Serial intelligence resolves product/outlet/sales-chain context where available.
3. Service coordinator assigns ASI and optionally SE.
4. Assigned operator logs visit.
5. Operator fills required active service form template submissions.
6. Operator uploads required photos/documents/test evidence where required by policy.
7. Operator submits test report linked to validated form submissions.
8. Reviewer chooses one path:
   - tested OK closure
   - warranty rejection closure
   - warranty approval
   - retest request
   - cancellation
   - telephonic closure where policy allows
9. Approved warranty path assigns replacement serials and creates replacement fulfillment order.
10. Replacement dispatch delivery auto-resolves the complaint or leaves explicit exception work for manual closure if delivery fails or order is cancelled.

### Lifecycle State Expectations

| State | Entry | Allowed Exit |
|---|---|---|
| `raised` | complaint created | assign, telephonic close, cancel |
| `assigned` | initial ASI assignment | visit logged, telephonic close, cancel |
| `visit` | visit logged | form-backed test submit, tested OK close where policy permits, telephonic close, cancel |
| `test_result_submitted` | test created | retest request, warranty approve, warranty reject, tested OK close, cancel |
| `retest_requested` | reviewer requests more evidence | visit logged, telephonic close, cancel |
| `resolved` | completed path | terminal |
| `telephonic_closure` | telephonic close | terminal unless a future separately logged reopen policy is added |
| `cancelled` | cancel | terminal unless a future separately logged reopen policy is added |

### Reopen Policy

There is no production reopen path in the current lifecycle. Choose one before launch:

- Preferred first release: closed complaints are immutable terminal records; a new complaint is raised for a new issue.
- Future option: add a governed reopen transition with permissions, required reason, SLA handling, and audit rules.

Do not leave UI endpoints that imply reopen behavior without a backend transition.

## Target Module Boundaries

### Backend

- `service-shared`: lifecycle rules, serial normalization, reusable service invariants.
- `service-complaints`: complaint read/write and transition orchestration.
- `service-assignments`: assignment history and assignment transition behavior.
- `service-forms`: template management and immutable submissions.
- `service-tests`: form-backed test report submission and retest operations.
- `service-warranty`: decision and replacement fulfillment orchestration.
- `service-serials`: serial intelligence reads backed by indexed data.
- `service-integrations`: machine credential management and machine-scoped contracts.
- `attachments`: real evidence asset lifecycle for service entities.

### Web

- Service list and queue surfaces.
- Service complaint detail workspace.
- Form template administration surface.
- Form fill and submission history surface.
- Warranty review and replacement fulfillment surface.
- Serial lookup surface.
- Machine client administration surface only when integration contracts are useful.

### Mobile

- Authenticated service engineer app.
- Assigned work queue.
- Complaint detail and serial context.
- Form capture and attachments.
- Field-safe sync/retry where required.

## Delivery Strategy

Use seven implementation phases. Each phase must open its own decision entry before code edits and finish with tests and explicit completion notes.

---

## Phase 0: Freeze Contracts And Remove Ambiguity

### Goal

Lock the first-release behavior before more code is added.

### Work

- Confirm first production release is web-first.
- Confirm canonical lifecycle table and action rules.
- Confirm the primary diagnostic path:
  - active template selection
  - form submission
  - test report linking
  - attachment policy
- Define service roles and permissions matrix:
  - complaint creator
  - service coordinator
  - ASI
  - SE
  - warranty approver
  - admin
- Decide closure/reopen policy.
- Decide whether telephonic closure requires evidence, note only, or supervisor permission only.
- Decide SLA metadata needed for first launch:
  - priority
  - due date
  - escalation owner
  - service region

### Deliverables

- Final service workflow contract.
- Role and permission matrix.
- Lifecycle action matrix for backend and UI.
- Form/evidence policy for first launch.

### Gate

- No frontend or mobile workflow work starts until the action matrix and diagnostic path are accepted.

---

## Phase 1: Fix Primary Backend And Web Workflow Coherence

### Goal

Make the existing web-operated workflow internally consistent with backend lifecycle and form gating.

### Backend Work

- Ensure `assigned` status appears consistently in service list output schemas and counts.
- Review all transition actions and remove redundant or misleading production paths.
- Keep initial assignment responsible for `raised -> assigned`.
- Keep reassignment as history mutation without pretending it performs first assignment.
- Decide whether `tested_ok_close` is allowed directly from `visit`; if yes, document evidence expectation; if no, require a submitted test first.
- Add structured output data needed for UI action rendering:
  - current status
  - allowed actions or transition policy version
  - latest assignment summary
  - form evidence readiness
  - attachment evidence summary
- Make direct route naming clear:
  - form submission endpoint means service form submission
  - test submission endpoint means test report creation after evidence gate

### Web Work

- Add `assigned` to all service status types, tabs, badge styling, queue counts, and filters.
- Fix action buttons so UI never exposes backend-invalid transitions.
- Separate "Assign" from "Reassign".
- Replace `/tickets/:id/forms` adapter behavior if it still calls test submission directly.
- Add complaint detail evidence readiness state:
  - no template configured
  - form required
  - form valid and ready
  - test submitted
- Remove or disable pseudo-reopen behavior until a backend reopen policy exists.
- Ensure warranty queue only displays complaints that truly meet warranty review criteria.

### Tests

- Backend transition contract tests for all states/actions.
- Web unit/component tests for action visibility per status.
- Web adapter tests for form submit vs test submit mapping.
- Regression test for initial assignment moving to `assigned`.

### Acceptance Criteria

- A complaint cannot reach an impossible state from the web UI.
- A complaint that reaches `assigned` is visible and filterable in web queues.
- Web first assignment uses the correct transition path.
- No production UI path says "forms" while directly bypassing the form layer.

---

## Phase 2: Diagnostic Forms, Templates, And Evidence Capture

### Goal

Make diagnostic evidence operational, not backend-only.

### Backend Work

- Finalize form-template versioning policy:
  - immutable snapshot expectation for submissions
  - edit behavior for templates with prior submissions
  - disabling instead of destructive deletion
- Add a deterministic seed/bootstrap path for at least one first-release service form template.
- Validate field-rule schema at template write time:
  - number limits
  - regex
  - select/multiselect options
  - date bounds
- Reject invalid template validation rules instead of silently allowing broken templates.
- Decide if forms are per complaint, per complaint line, per product category, or template-selected by user in first release.
- Expose form submission readiness summary to complaint detail.

### Web Work

- Add template administration UI:
  - list templates
  - create template
  - add/edit/disable fields
  - activate/disable templates
  - version visibility
- Add complaint form capture UI:
  - choose allowed active template
  - render field controls by type
  - validate before submit
  - show immutable submission history
  - show disabled submissions and reason
- Add test submit UI only after form readiness passes.
- Link visible test report records to related submissions.

### Evidence Policy

Decide by first release whether forms require:

- no attachment
- optional attachment
- mandatory attachment by template or field policy

If mandatory evidence is required, expose that as explicit backend readiness logic rather than only UI convention.

### Tests

- Template rule validation tests.
- Form submit tests for each field type.
- Test submit rejection without form submission.
- Test submit rejection with disabled or invalid evidence.
- Web render tests for template controls and immutable submission history.

### Acceptance Criteria

- Admin can configure a usable first-release diagnostic form without database hand edits.
- Service operator can submit form evidence from the complaint workspace.
- Test report submission succeeds only from the evidence-backed path.
- Existing form submissions stay auditable after template changes.

---

## Phase 3: Warranty, Replacement, Inventory, And Serial Integrity

### Goal

Make warranty decisions and replacement fulfillment safe for real serialized products.

### Backend Work

- Verify warranty approval prerequisites:
  - test submitted
  - required evidence present
  - source warehouse valid
  - complaint line product data valid for fulfillment
- Define replacement serial eligibility rules:
  - uniqueness across service replacement lines
  - dispatch history expectations
  - product compatibility if enforceable
  - stock/warehouse availability if applicable
- Ensure fulfillment order creation is idempotent.
- Ensure failed or cancelled fulfillment paths do not auto-resolve complaint.
- Review dispatch delivery auto-resolution conditions and exception behavior.
- Confirm warranty replacement order cannot generate revenue invoice accidentally.
- Confirm serial event chain records:
  - original complaint link
  - replacement assignment
  - replacement order creation
  - dispatch delivery

### Web Work

- Show warranty readiness blockers before approve.
- Show replacement order status and dispatch status on complaint detail.
- Show serial conflicts before replacement assignment.
- Show product and warehouse selection errors early.
- Provide a clear manual exception path when replacement fulfillment cannot proceed.

### Tests

- Warranty approve/reject integration tests.
- Replacement conflict tests.
- Fulfillment order idempotency tests.
- Invoice suppression regression test.
- Dispatch-delivery auto-resolution test.
- Dispatch cancellation/failure exception test.

### Acceptance Criteria

- Warranty replacement cannot silently create a financially incorrect order.
- Replacement serial conflicts are blocked before dispatch.
- Complaint auto-resolution happens only on the intended fulfillment success path.
- Serial timeline is sufficient to audit original and replacement history.

---

## Phase 4: Attachments And Real Storage

### Goal

Ship real diagnostic asset handling.

### Backend Work

- Replace placeholder upload URL generation with real object-storage signing.
- Add storage configuration validation at startup.
- Confirm attachment confirmation verifies intended object existence or trusted callback semantics.
- Add read/download URL path and authorization policy.
- Add content restrictions:
  - MIME allowlist
  - file-size limits
  - filename normalization
  - malware scanning hook or explicit deferred risk decision
- Add retention and deletion rules for:
  - complaint attachments
  - test attachments
  - form submission attachments

### Web Work

- Add complaint/test/form attachment upload UI.
- Show upload progress, retry, failure, confirmation state, and attachment history.
- Prevent forms/tests from claiming required evidence is complete before attachments are confirmed.

### Mobile Work

- Reuse the same attachment contract when mobile implementation starts.

### Tests

- Signed upload contract tests.
- Authorization tests for attachment list/read/remove.
- Expired pending-upload tests.
- Evidence readiness tests when required attachment remains pending.

### Acceptance Criteria

- A production user can upload and later read service evidence from real storage.
- Unauthorized users cannot read service evidence assets.
- Required evidence gate is based on confirmed storage state.

---

## Phase 5: Service Mobile App Readiness

### Goal

Replace the current scaffold with a releasable service engineer workflow if mobile is in product scope.

### Required Scope

- Real login/session management and token refresh behavior.
- Assigned work queue with stage filters.
- Complaint detail with serial and outlet context.
- Assignment-aware action guardrails.
- Form capture with field-type rendering.
- Attachment capture and upload:
  - camera/photo
  - document upload if required
  - retry and progress state
- Test submission after form/evidence readiness.
- Retest handling.
- Telephonic closure only if allowed for the user's role.
- Error recovery under poor connectivity.

### Offline Position

Choose explicitly:

- Minimum first release: online-only with visible blocked states and retry.
- Production field release: durable offline drafts/queue for forms and attachments.

Do not imply offline capability unless the queue, retry, conflict, and sync tests exist.

### Mobile Tests

- Widget tests for queue/detail/form/test paths.
- Auth/session recovery tests.
- API contract tests.
- Device QA for image/document upload.
- Connectivity-loss test matrix if offline work is enabled.

### Acceptance Criteria

- No placeholder scaffold text remains in release screens.
- A service engineer can complete the scoped complaint work from mobile.
- Mobile actions respect backend RBAC and lifecycle failures.
- Analyzer, tests, and release build checks pass.

---

## Phase 6: Machine Integration Contracts

### Goal

Turn machine-client credential primitives into useful, secure integration contracts only where needed.

### Backend Work

- Define machine-scoped use cases:
  - auth probe only
  - serial lookup
  - diagnostic result ingest
  - attachment/evidence ingest
  - test draft creation
- Add scoped procedures for approved use cases.
- Use narrow scopes instead of broad internal permissions.
- Add idempotency keys for machine-originated writes.
- Add request size limits, rate limits, and audit trail.
- Add secret rotation and expiry runbook.
- Decide whether machine writes create:
  - raw evidence only
  - service form submissions
  - test reports only after human review

### Contract Artifacts

- Integration API examples.
- Scope mapping.
- Error model.
- Auth header documentation.
- Rotation and revoke procedure.

### Tests

- Machine auth success/failure tests.
- Scope denial tests.
- Revoked/expired secret tests.
- Idempotent write tests for any machine ingestion route.

### Acceptance Criteria

- Every exposed machine scope has a business API and contract test.
- UI does not market machine integration as ready when only credentials exist.

---

## Phase 7: Production Operations, Security, And Launch

### Goal

Make the module safe to deploy, observe, support, and recover.

### Deployment Work

- Remove force-reset deploy behavior before any real service data is stored.
- Replace schema push-only production workflow with an approved migration workflow.
- Add production backup and restore rehearsal.
- Separate demo seed from production setup.
- Add rollback procedure for backend and web releases.

### Observability

- Structured logs for:
  - complaint transition failures
  - form validation failures
  - test submission gate failures
  - warranty decision failures
  - replacement order failures
  - attachment upload/confirmation failures
  - machine auth/scope failures
- Metrics/dashboard candidates:
  - complaint counts by status
  - open complaint age/SLA breach count
  - form readiness failures
  - warranty queue age
  - replacement fulfillment exceptions
  - attachment failures
  - serial lookup latency
  - machine client auth rate and denial rate
- Alerts:
  - backend readiness failure
  - DB migration failure
  - object storage failure
  - repeated service route 5xx
  - replacement-order creation failure spike

### Security And Privacy

- Confirm RBAC matrix with real seeded production roles.
- Prevent outlet/customer data leakage in service reads.
- Review whether all service write routes should require internal users.
- Add attachment access audit requirements if evidence is sensitive.
- Add rate limits for auth and machine-client surfaces.
- Add secrets handling policy for machine clients and object storage.
- Define data retention for service evidence and audit records.

### Runbooks

- Complaint workflow support runbook.
- Warranty/replacement exception runbook.
- Attachment failure runbook.
- Machine-client rotation/revoke runbook.
- Serial intelligence backfill and lookup troubleshooting runbook.
- Backup/restore and deployment runbook.

### Acceptance Criteria

- Production deploy no longer destroys service data.
- Rollback and restore have been rehearsed.
- Support team can diagnose a stuck complaint from logs, timeline, evidence state, and replacement-order state.

## Serial Intelligence Scale Plan

### Problem

Legacy serial resolution currently depends on dispatch data scanning. That will become slower and less predictable as dispatch history grows.

### Plan

- Treat `ServiceSerialIndex` and `ServiceSerialEvent` as the production read model.
- Add a backfill job for legacy serials from dispatch history.
- Hydrate new serial index/events during normal sales, dispatch, replacement, and service writes.
- Keep fallback legacy lookup only during migration if required.
- Add telemetry for fallback usage and serial lookup latency.
- Remove or constrain fallback scanning after backfill confidence is high.

### Gate

- Serial lookup latency and query cost must be acceptable on realistic dispatch volume before launch.

## Data And Migration Plan

### Required Data Setup

- Production service roles and permissions.
- Active service form templates.
- Warehouses eligible for replacement fulfillment.
- Product and serial data readiness.
- Object storage buckets/policies for service attachments.

### Migration Sequence

1. Stop destructive deploy behavior.
2. Create formal database migration for any schema changes not yet migration-managed.
3. Apply migration in staging with representative data.
4. Seed only configuration data approved for production:
   - roles/permissions where applicable
   - initial form templates
5. Backfill serial read model.
6. Validate replacement-order and dispatch integration on staging.
7. Rehearse rollback and restore.
8. Deploy to production behind explicit release checklist.

## Test Matrix

### Backend Unit Tests

- transition matrix
- serial normalization
- form validation helpers
- template rule schema validation
- warranty prerequisites
- replacement serial eligibility helpers

### Backend Integration Tests

- complaint create/list/detail/update
- initial assignment and reassignment
- visit/test/retest state flow
- form template create/update/disable behavior
- immutable form submissions and disable reason
- form-backed test submission
- warranty approve/reject
- fulfillment order idempotency
- dispatch-delivery complaint resolution
- attachments for service entities
- RBAC denial for every protected route class
- machine auth and scope checks

### Web Tests

- status tabs and filters include all backend statuses
- action buttons match status and permission
- complaint detail form capture
- evidence readiness and test submission
- warranty queue and replacement fulfillment
- serial lookup error and conflict views
- attachment progress/failure states

### Mobile Tests

- auth/session bootstrap
- queue and detail fetch states
- form rendering and submission
- attachment upload
- lifecycle failure messaging
- connectivity behavior according to chosen offline scope

### End-To-End Scenarios

1. Raise complaint, assign, visit, submit form, submit test, reject warranty, resolve.
2. Raise complaint, assign, visit, submit form, approve warranty, assign replacement serial, create fulfillment order, dispatch delivery, auto-resolve.
3. Retest loop from submitted test back to visit and second test.
4. Telephonic closure with required note and permission.
5. Cancellation with reason and audit record.
6. Replacement serial conflict.
7. Attachment required but pending upload not confirmed.
8. Unauthorized role attempts warranty approval.
9. Machine client revoked or missing scope.
10. Serial lookup on representative high-volume dataset.

## Release Checklist

### Functional

- [ ] Canonical lifecycle implemented and documented.
- [ ] `assigned` state supported in backend output and UI.
- [ ] Form-backed diagnostic path is the only production test path.
- [ ] Required first-release templates exist.
- [ ] Warranty and fulfillment paths pass end-to-end tests.
- [ ] Attachments use real storage.
- [ ] Serial lookup performance is accepted.

### Security

- [ ] RBAC matrix approved and tested.
- [ ] Service evidence authorization tested.
- [ ] Machine-client scopes tested or machine release deferred.
- [ ] Secrets rotation and storage documented.

### Operations

- [ ] Destructive deploy reset removed.
- [ ] Migrations approved.
- [ ] Backup and restore rehearsal completed.
- [ ] Logs, metrics, and alerts configured.
- [ ] Runbooks written.

### Client Surfaces

- [ ] Web workflow passes acceptance tests.
- [ ] Mobile release explicitly passed or explicitly deferred.
- [ ] External machine integration explicitly passed or explicitly deferred.

## Suggested Implementation Backlog

### P0 Before Any Production Data

1. Remove destructive deploy reset and establish migration/backup path.
2. Fix `assigned` status and assignment action mismatch.
3. Replace direct web test submission with form-backed flow.
4. Add first-release form-template UI and bootstrap templates.
5. Add service workflow integration tests.
6. Replace placeholder attachment storage contract.

### P1 Before Service Launch

1. Harden warranty prerequisites and replacement order exception handling.
2. Add RBAC and audit regression tests.
3. Add serial backfill/read-model hardening.
4. Add operational logging, metrics, and runbooks.
5. Complete web acceptance coverage.

### P2 Gated Extensions

1. Complete Service Mobile App.
2. Add durable mobile offline behavior if service field conditions require it.
3. Add machine-scoped diagnostic ingestion if integrations are real launch scope.
4. Add SLA dashboards, escalation automation, and advanced service analytics.

## Suggested Work Packages And Ownership

| Work Package | Primary Owner | Dependencies |
|---|---|---|
| Lifecycle/UI coherence | backend + web | Phase 0 decisions |
| Form/evidence workflow | backend + web | lifecycle coherence |
| Attachment storage | backend + infra + web | object storage config |
| Warranty/fulfillment integrity | backend + web | forms/evidence path |
| Serial scale hardening | backend/data | representative dispatch data |
| Service mobile release | mobile + backend | stable API contracts |
| Machine integrations | backend + integrator | approved use cases |
| Production operations | infra + backend | migration and storage plan |

## Definition Of Done

The Service module is production-ready only when:

- the canonical workflow is implemented end to end from UI to backend;
- tests cover the stateful workflow and failure cases;
- RBAC and audit behavior are verified;
- diagnostic forms and required evidence are operable from release clients;
- warranty replacement flows preserve order, dispatch, invoice, inventory, and serial integrity;
- real attachment storage is live;
- serial intelligence works on realistic production volume;
- production deploys preserve data and have rollback/restore procedures;
- web release passes acceptance criteria;
- mobile and machine integrations are either fully gated through their own acceptance criteria or explicitly deferred from the launch claim.
