# Service Module Master Audit Report
**Date:** 2026-05-24  
**Auditors:** 9 parallel AI agents  
**Total bugs found:** 285 across 9 audit dimensions  
**Status:** Fixes in progress

---

## Summary by Severity

| Severity | Backend | Frontend | Total |
|----------|---------|----------|-------|
| Critical | 18 | 4 | **22** |
| High | 62 | 34 | **96** |
| Medium | 59 | 31 | **90** |
| Low | 46 | 31 | **77** |
| **Total** | **185** | **100** | **285** |

---

## Critical Bugs (Must fix before production)

### SW-002 — Warranty approve discards status transition (service-warranty.ts:53)
`resolveTransition()` return value is discarded. Complaint status NEVER advances after warranty approval. State machine completely broken for approval flow.

### SC-004 / SX-001 — Complaint number race condition (service-shared.ts:114)
Two concurrent requests both see no row → both try CREATE → duplicate `CMP-YYYY-000001`. Prisma upsert is not serializable. Will corrupt complaint numbering under any concurrent load.

### SI-001 — Secret transmitted in plain HTTP header (service-integrations.ts:34)
`x-service-client-secret` header is logged by every proxy, load balancer, and access log in the chain.

### SI-002/003/004 — Cross-org IDOR on machine clients
`listClients`, `rotateSecret`, `revokeClient` have no orgId scoping. Any `service:manage` actor can enumerate all tenants' API keys, rotate any secret (credential takeover), or revoke any client (DoS).

### SS-002 — Full-table scan on DispatchLine (service-shared.ts:169)
`findSerialLegacyDispatchRows` has NO WHERE clause. Loads entire DispatchLine table into memory and filters in JavaScript. Called TWICE per serial resolve (SS-009). Production time bomb.

### SS-004/005 — `skipDuplicates: true` is a no-op (service-shared.ts:274)
`ServiceSerialEvent` has no `@@unique` constraint. Every concurrent or repeated resolve for an unhydrated serial writes unlimited duplicate event rows.

### SC-001 / SX-009-012 — No orgId on ANY service model (schema.prisma)
`ServiceComplaint`, `ServiceSerialIndex`, `ServiceMachineClient`, `ServiceFormTemplate` all lack `orgId`. Any `service:read` user can read all tenants' data. Data isolation failure across the entire module.

### FC-023 — Rotate secret has no confirmation dialog (ServiceIntegrationsPage.tsx:93)
One mis-click invalidates active integration credentials for all downstream systems.

### FP-003 — `assigned` tab count always shows 0 (ServiceComplaintsPage.tsx:156)
Zod strips `assigned` from the backend response. Active complaint count is systematically wrong.

---

## Files Changed by Fix Agents

| Fix Agent | Files | Key Bugs |
|-----------|-------|----------|
| Fix-1: service-shared.ts | service-shared.ts, service-shared.test.ts | SC-004, SX-001, SX-003, SX-006, SS-018 |
| Fix-2: service-complaints.ts | service-complaints.ts | SC-002, SC-006, SC-007, SC-008, SC-015, SC-019 |
| Fix-3: service-warranty.ts | service-warranty.ts | SW-002, SW-003, SW-007, SW-012, SW-019 |
| Fix-4: service-integrations.ts | service-integrations.ts | SI-001, SI-007, SI-008, SI-013, SI-014 |
| Fix-5: service-assignments + tests | service-assignments.ts, service-tests.ts | SAT-002, SAT-004, SAT-006, SAT-009, SAT-013 |
| Fix-6: service-forms.ts | service-forms.ts | SF-002, SF-005, SF-006, SF-015, SF-016, SF-017 |
| Fix-7: schema.prisma | schema.prisma | SX-016-022 (indexes), SX-034-036 (enums), SS-005 |
| Fix-8: Frontend pages | 5 page files | FP-001, FP-003, FP-008, FP-016, FP-020, FP-022, FP-033 |
| Fix-9: Frontend components | DynamicServiceForm, ServiceStatusBadge | FC-001, FC-002, FC-003, FC-013, FC-023 |

---

## Full Bug List

### SC — service-complaints.ts (30 bugs)
- SC-001 CRITICAL: No orgId scoping on any query
- SC-002 CRITICAL: Duplicate cancel path (transition + standalone cancel)
- SC-003 CRITICAL: N+1 + full-table scan on create (DoS)
- SC-004 CRITICAL: Complaint number race condition
- SC-005 HIGH: `get` returns list-item schema instead of detail schema
- SC-006 HIGH: `assigned` silently stripped from tabCounts by Zod schema
- SC-007 HIGH: `update` allows edits on closed complaints
- SC-008 HIGH: `update` not transactional (complaint + activity)
- SC-009 HIGH: Full-table scan in findSerialLegacyDispatchRows
- SC-010 HIGH: 3 extra DB round-trips after transaction in create
- SC-011 HIGH: Verbatim code duplication (detail serialization)
- SC-012 HIGH: Dead actorId null-check after perm()
- SC-013 MEDIUM: telephonic_close has no source-state guard
- SC-014 MEDIUM: cancel can cancel a resolved complaint
- SC-015 MEDIUM: tabCounts ignores search/status filters (always global)
- SC-016 MEDIUM: Offset pagination (O(N) scan, unstable)
- SC-017 MEDIUM: TOCTOU on userType check outside transaction
- SC-018 MEDIUM: warranty_reject allows empty note
- SC-019 MEDIUM: service:assign permission never enforced in transition
- SC-020 MEDIUM: tabCounts recomputed on every page (no caching)
- SC-021 MEDIUM: ensureSerialIndex called outside transaction
- SC-022 MEDIUM: Legacy history hard-capped at 3, silently truncated
- SC-023 MEDIUM: No upper bound on complaint lines array (DoS)
- SC-024 MEDIUM: Audit log missing before-values (no diff)
- SC-025 LOW: SC-026 LOW: assertServiceReadable is dead code
- SC-027 LOW: Double normalization in serialMatches
- SC-028 LOW: userType exclusion check fragile
- SC-029 LOW: Inconsistent UUID validation across schemas
- SC-030 LOW: Sequence overflow after 999999

### SW — service-warranty.ts (24 bugs)
- SW-001 CRITICAL: No orgId scoping in approve
- SW-002 CRITICAL: resolveTransition return discarded — status never advances
- SW-003 CRITICAL: Re-approval silently overwrites approved decision
- SW-004 CRITICAL: Re-approval orphans existing replacement order
- SW-005 HIGH: No orgId scoping in reject
- SW-006 HIGH: Double-rejection silently allowed
- SW-007 HIGH: TOCTOU race in assignReplacement serial conflict check
- SW-008 HIGH: No complaint status guard in assignReplacement
- SW-009 HIGH: No orgId scoping on serial conflict check
- SW-010 HIGH: No orgId scoping in createFulfillmentOrder
- SW-011 HIGH: Stale replacementOrderId creates second fulfillment order
- SW-012 HIGH: False BAD_REQUEST when duplicate productIds in input
- SW-013 HIGH: Order created in approved status bypassing workflow
- SW-014 HIGH: Redundant/wrong delivery address fallback
- SW-015 MEDIUM: nextOrderNumber not concurrency-safe
- SW-016 MEDIUM: service:approve overused where lower permission suffices
- SW-017 MEDIUM: assignReplacement corrupts rejected decisions
- SW-018 MEDIUM: Redundant actorId null-check (dead code)
- SW-019 MEDIUM: Serial events fired for lines not in fulfillment batch
- SW-020 MEDIUM: No read-only getter endpoint
- SW-021 MEDIUM: resolutionNote silently overwritten on reject
- SW-022 LOW: Unnecessary fallback in output mapping
- SW-023 LOW: Hard-coded enum string literals
- SW-024 LOW: Silent empty-string SKU fallback

### SS — service-serials.ts (22 bugs)
- SS-001 CRITICAL: Cross-org leak in complaintLinks query
- SS-002 CRITICAL: Full-table scan on DispatchLine (no WHERE)
- SS-003 CRITICAL: Cross-org leak in serviceSerialEvent.findMany
- SS-004 CRITICAL: TOCTOU race in ensureSerialIndex
- SS-005 CRITICAL: skipDuplicates no-op (no @@unique on ServiceSerialEvent)
- SS-006 HIGH: Cross-org leak in replacementEligibility
- SS-007 HIGH: Redundant double-lookup (parallel findUnique + ensureSerialIndex)
- SS-008 HIGH: Serial input validation allows empty-after-normalize
- SS-009 HIGH: findSerialLegacyDispatchRows called TWICE per resolve
- SS-010 HIGH: Stale product assignment (multi-dispatch conflict)
- SS-011 HIGH: No list/search endpoint
- SS-012 HIGH: No write/correction endpoints
- SS-013 MEDIUM: Hard-coded take:50 on events (no pagination)
- SS-014 MEDIUM: Write side-effect inside read query
- SS-015 MEDIUM: Silent product fallback hides data quality
- SS-016 MEDIUM: Complaint link role ambiguous (single vs array)
- SS-017 MEDIUM: Cancelled complaints count as replacement conflicts
- SS-018 MEDIUM: serialNumber casing overwritten on every update
- SS-019 MEDIUM: replacementEligibility missing post-normalize validation
- SS-020 LOW: eventAt defaults hide incorrect timestamps
- SS-021 LOW: Output schema not in sync with DB types
- SS-022 LOW: No permission separation on resolve vs replacementEligibility

### SF — service-forms.ts (30 bugs)
- SF-001 CRITICAL: No org-scoping on submitForm
- SF-002 CRITICAL: Can submit to closed complaints
- SF-003 HIGH: listTemplates fetches fields even when withFields=false
- SF-004 HIGH: listSubmissions has no pagination
- SF-005 HIGH: Duplicate fieldKeys silently resolved (last wins)
- SF-006 HIGH: validationRules null not passed to Prisma (undefined ≠ null)
- SF-007 HIGH: disableSubmission has no ownership check
- SF-008 HIGH: updateTemplate allows editing disabled templates
- SF-009 HIGH: addField allows adding to disabled templates
- SF-010 HIGH: updateField allows editing on disabled template
- SF-011 MEDIUM: Missing explicit onDelete on submission→template FK
- SF-012 MEDIUM: Missing explicit onDelete on value→field FK
- SF-013 MEDIUM: updateTemplate TOCTOU (read then write)
- SF-014 MEDIUM: updateField/disableField same TOCTOU
- SF-015 MEDIUM: select fields with empty options unsubmittable
- SF-016 MEDIUM: Date validation accepts invalid dates via JS coercion
- SF-017 MEDIUM: Regex validation vulnerable to ReDoS
- SF-018 MEDIUM: Empty rawValue inserted for non-required fields
- SF-019 MEDIUM: listTemplates has no pagination
- SF-020 MEDIUM: Duplicate fieldKey in createTemplate hits P2002 as 500
- SF-021 MEDIUM: addField duplicate fieldKey hits P2002 as 500
- SF-022 MEDIUM: disableSubmission null complaint causes misleading activity
- SF-023/024/025 LOW: Redundant actorId null-checks (dead code x3)
- SF-026 LOW: validateFieldValue default case silently passes unknown types
- SF-027 LOW: listSubmissions sorted by createdAt, should be submittedAt
- SF-028 LOW: getTemplate fields typed optional but always returned
- SF-029 LOW: Unknown fieldKeys in submission silently ignored
- SF-030 LOW: updateTemplate no-op still hits DB

### SI — service-integrations.ts (24 bugs)
- SI-001 CRITICAL: Secret in plain HTTP header (logged by proxies)
- SI-002 CRITICAL: listClients has no orgId scoping
- SI-003 CRITICAL: rotateSecret has cross-org IDOR
- SI-004 CRITICAL: revokeClient has cross-org IDOR
- SI-005 HIGH: clientId P2002 constraint not handled gracefully
- SI-006 HIGH: listClients has no pagination
- SI-007 HIGH: rotateSecret not atomic (TOCTOU)
- SI-008 HIGH: revokeClient allows double-revocation
- SI-009 HIGH: Redundant actorId null-checks (dead code)
- SI-010 HIGH: Audit write on every auth request (no throttle)
- SI-011 HIGH: Expiry check uses <= (off-by-ms) + no compound DB guard
- SI-012 MEDIUM: secretLast4 entropy comment absent
- SI-013 MEDIUM: Prisma errors not caught in middleware (500 leak)
- SI-014 MEDIUM: Scopes not validated against registry
- SI-015 MEDIUM: listClients no status filter
- SI-016 MEDIUM: createdById exposed in response (internal UUID leak)
- SI-017 MEDIUM: createdBy no onDelete directive
- SI-018 MEDIUM: No getClient endpoint
- SI-019 MEDIUM: No updateClient endpoint
- SI-020 MEDIUM: No listAuditLogs endpoint
- SI-021 LOW: Date fields typed as z.string() not z.string().datetime()
- SI-022 LOW: clientId validation too permissive (min(8) not format check)
- SI-023 LOW: Scope strings are bare literals not catalog constants
- SI-024 LOW: Audit log missing clientId in meta

### SAT — service-assignments.ts + service-tests.ts (22 bugs)
- SAT-001 CRITICAL: No orgId scoping in assign/reassign
- SAT-002 HIGH: No validation that ASI/SE users exist and are active
- SAT-003 HIGH: Assignment terminal-status guard conditional (can bypass)
- SAT-004 HIGH: reassign has zero terminal-status check
- SAT-005 HIGH: No list/history query procedure
- SAT-006 HIGH: Can submit assignment with neither ASI nor SE
- SAT-007 HIGH: Race condition on concurrent test submissions
- SAT-008 HIGH: Unbounded include inside transaction for form gate
- SAT-009 HIGH: No validation that complaintLineId belongs to complaint
- SAT-010 HIGH: updateMany missing complaintId scope
- SAT-011 HIGH: requestRetest has no org ownership check
- SAT-012 MEDIUM: serviceTestsRouter is write-only
- SAT-013 MEDIUM: createdAt typed as z.string() (superjson mismatch)
- SAT-014 MEDIUM: Same superjson mismatch in service-tests.ts
- SAT-015 MEDIUM: Redundant actorId null-checks (dead code)
- SAT-016 MEDIUM: TOCTOU — complaint fetched outside transaction
- SAT-017 MEDIUM: Misleading error due to TOCTOU gap
- SAT-018 MEDIUM: No updatedAt on assignment/test tables
- SAT-019 MEDIUM: assign can be called multiple times (duplicate records)
- SAT-020 LOW: structuredData null vs undefined Prisma cast
- SAT-021 LOW: resolveTransition before form gate (ordering)
- SAT-022 LOW: No-op reassignment creates spurious record

### SX — service-shared.ts + schema + RBAC (37 bugs)
- SX-001 CRITICAL: Sequence race (same as SC-004)
- SX-002 HIGH: Off-by-one in sequence + unhandled unique constraint on duplicate
- SX-003 HIGH: telephonic_close bypasses warranty workflow
- SX-004 HIGH: serialNumber overwritten on every update
- SX-005 HIGH: Hydration hard-capped at 3, no catch-up
- SX-006 HIGH: meta ?? undefined loses audit data (Prisma treats undefined as omit)
- SX-007 HIGH: Duplicate cancel path (same as SC-002)
- SX-008 HIGH: TOCTOU in assignReplacement (same as SW-007)
- SX-009 HIGH: ServiceComplaint has no orgId
- SX-010 HIGH: ServiceSerialIndex/Event have no orgId
- SX-011 HIGH: ServiceMachineClient has no orgId
- SX-012 HIGH: ServiceFormTemplate has no orgId
- SX-013 MEDIUM: assertServiceReadable is existence check, not auth check
- SX-014 MEDIUM: assigned dropped from tabCounts (same as SC-006)
- SX-015 MEDIUM: Full-table scan in findSerialLegacyDispatchRows
- SX-016 MEDIUM: Missing @@index on ServiceComplaintLine for OR query
- SX-017 MEDIUM: Missing @@index([actorId]) on ServiceComplaintActivity
- SX-018 MEDIUM: Missing @@index([submittedById]) on ServiceTestReport
- SX-019 MEDIUM: Missing @@index([submittedById]) on ServiceFormSubmission
- SX-020 MEDIUM: Missing @@index([asiUserId/seUserId]) on ServiceAssignmentHistory
- SX-021 MEDIUM: Missing @@index([raisedById]) on ServiceComplaint
- SX-022 MEDIUM: ServiceComplaintSequence has no orgId dimension
- SX-023 MEDIUM: Form gate checks complaint-level only, not per-line
- SX-024 MEDIUM: createFulfillmentOrder duplicate productId guard bug (same as SW-012)
- SX-025 MEDIUM: update mutation bypasses AuditLog (uses direct create)
- SX-026 MEDIUM: normalizeSerial strips meaningful separators (silent data loss)
- SX-027 MEDIUM: authProbe scope uses dots not colons (mismatch with RBAC)
- SX-028 LOW: No unit tests for nextComplaintNumber
- SX-029 LOW: No unit tests for parseSerialNumbers
- SX-030 LOW: telephonic_close from test_result_submitted not tested
- SX-031 LOW: warranty_approve/reject transitions not tested
- SX-032 LOW: cancel from final state not tested
- SX-033 LOW: RBAC lacks separate integration permission (machine client mgmt)
- SX-034 LOW: ServiceTestReport.verdict is untyped String
- SX-035 LOW: ServiceAssignmentHistory.action is untyped String
- SX-036 LOW: ServiceSerialEvent event/entity types are untyped Strings
- SX-037 LOW: ServiceFormSubmission has duplicate timestamps

### FP — Frontend pages (57 bugs)
- FP-001 CRITICAL: No debounce on search (every keystroke = API call)
- FP-002 CRITICAL: No staleTime → stale flash on every refetch
- FP-003 CRITICAL: assigned tab count always 0
- FP-004 HIGH: Response shape fragile (as any cast)
- FP-005 HIGH: Hard-coded limit:100 with no pagination UI
- FP-006 HIGH: visibleRows useMemo is a no-op
- FP-007 HIGH: Double-submit race on create
- FP-008 HIGH: No permission guard on New Complaint button
- FP-009 HIGH: Outlets query hard-coded at limit:200
- FP-010 HIGH: Stale closure in assignMutation
- FP-011 HIGH: Stale closure in fulfillmentMutation
- FP-012 HIGH: Global isPending blocks all action buttons
- FP-013 HIGH: invalidate() not awaited in onSuccess
- FP-014 HIGH: N+1 serial insights on every detail load
- FP-015 HIGH: Partial fulfillment order created silently
- FP-016 HIGH: Fake delivery address sent to backend
- FP-017 HIGH: No permission guard on Assignment panel
- FP-018 HIGH: No permission guard on Warranty Decision panel
- FP-019 HIGH: No permission guard on Form/Test submission
- FP-020 HIGH: Templates page filters out disabled templates (can't manage them)
- FP-021 HIGH: disableMutation missing onError handler
- FP-022 HIGH: window.confirm() for disable (blocking)
- FP-023 HIGH: No permission guard on template management buttons
- FP-024 HIGH: addFieldMutation can fire with null templateId
- FP-025 HIGH: Rotation/revoke pending applies to ALL client rows
- FP-026 HIGH: revokeMutation missing onError
- FP-027 HIGH: Memory leak in clipboard setTimeout
- FP-028 HIGH: Create dialog state not reset on overlay close
- FP-029 HIGH: window.confirm() for revoke (blocking)
- FP-030 HIGH: rotateMutation missing onError
- FP-031 HIGH: ServiceWarrantyPage has no auto-refresh
- FP-032 HIGH: Hard-coded limit:100 in warranty queue
- FP-033 HIGH: reduce() crash on empty array
- FP-034 MEDIUM: Skeleton only on initial load, not refetch
- FP-035 MEDIUM: Serial lines keyed by index (unstable)
- FP-036 MEDIUM: Error not cleared on retype
- FP-037 MEDIUM: Test history hidden during test_result_submitted
- FP-038 MEDIUM: invalidate not in useCallback
- FP-039 MEDIUM: Assignment history shows UUIDs not names
- FP-040 MEDIUM: Hardcoded route string for replacement order
- FP-041 MEDIUM: Misleading hint about asiUserId requirement
- FP-042 MEDIUM: Field sort not memoized
- FP-043 MEDIUM: Preview form has no-op onSubmit
- FP-044 MEDIUM: Field key validation ordering
- FP-045 MEDIUM: Expiry date parse error not user-friendly
- FP-046 MEDIUM: clipboard.writeText not in try/catch
- FP-047 MEDIUM: No permission guard on WarrantyPage
- FP-048 MEDIUM: Wait time uses updatedAt not status timestamp
- FP-049 MEDIUM: Serial lookup uses manual state not useQuery
- FP-050 MEDIUM: Response unwrap triple-fallback
- FP-051 LOW: Serial badge key collision risk
- FP-052 LOW: Date formatting no locale
- FP-053 LOW: Misleading null→status activity display
- FP-054 LOW: Option chip duplicate key risk
- FP-055 LOW: Client ID truncation ambiguous
- FP-056 LOW: Warranty table 'Submitted' column shows wrong timestamp
- FP-057 LOW: result.events optional chain missing

### FC — Frontend components + remaining pages (39 bugs)
- FC-001 HIGH: Boolean field submit validation race (stale hasErrors)
- FC-002 HIGH: handleSubmit checks stale hasErrors closure
- FC-003 HIGH: Required fields silently dropped from payload
- FC-004 MEDIUM: textarea/label not associated (htmlFor missing)
- FC-005 MEDIUM: Boolean radio group missing fieldset/legend
- FC-006 MEDIUM: Multiselect missing role=group
- FC-007 MEDIUM: select missing id/htmlFor
- FC-008 MEDIUM: Error paragraph not aria-live
- FC-009 MEDIUM: useEffect only deps on template.id not initialValues
- FC-010 LOW: Number input accepts scientific notation
- FC-011 LOW: No explicit default for unknown field types
- FC-012 LOW: toggle function recreated on each render
- FC-013 MEDIUM: StatusBadge fallback shows 'Raised' for unknown status
- FC-014 MEDIUM: WarrantyStatusBadge fallback shows 'Pending' for unknown
- FC-015 LOW: Status badges missing aria-label
- FC-016 HIGH: ServiceSerialsPage response unwrapping extra nesting
- FC-017 HIGH: Uses api.get shim instead of trpcQuery (inconsistent)
- FC-018 MEDIUM: No request cancellation on concurrent lookups
- FC-019 MEDIUM: Enter key not blocked during loading
- FC-020 MEDIUM: Unsafe as ComplaintStatus cast
- FC-021 LOW: Event timeline shows date only, not time
- FC-022 MEDIUM: ServiceSerialsPage has no page-level permission guard
- FC-023 CRITICAL: Rotate secret has no confirmation dialog
- FC-024 HIGH: Pending state applied to ALL client rows
- FC-025 HIGH: Clients list response unwrapping potentially wrong
- FC-026 HIGH: createMutation secret extraction may silently fail
- FC-027 MEDIUM: Secret dialog dismissable without warning (secret lost)
- FC-028 MEDIUM: Revoke uses window.confirm() not Dialog
- FC-029 MEDIUM: Client name input label not associated
- FC-030 MEDIUM: Expiry input no min date, no htmlFor
- FC-031 MEDIUM: ServiceIntegrationsPage has no page-level permission guard
- FC-032 LOW: clientId not copyable in list view (only in modal)
- FC-033 LOW: Revoked timestamp shows rotation time not revocation time
- FC-034 MEDIUM: Missing breadcrumb for /service/forms in DashboardLayout
- FC-035 LOW: Missing breadcrumbs for field-* pages
- FC-036 LOW: SidebarContent defined inside DashboardLayout (remount on each render)
- FC-037 MEDIUM: All service routes behind AdminRoute only, no per-page guards
- FC-038 LOW: clipboard writeText not in try/catch (integrations)
- FC-039 MEDIUM: ALL form fields missing id/htmlFor (label association broken)
