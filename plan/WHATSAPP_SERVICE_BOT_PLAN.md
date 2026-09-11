# WhatsApp Service Client Bot Plan

## Goal

Give service customers timely, trustworthy WhatsApp updates without creating a
second service workflow. WhatsApp is a notification and guided self-service
channel; the existing complaint record, activity history, and service portal
remain the system of record.

The first release should answer three customer needs:

1. "Was my complaint registered?"
2. "What is happening with it now?"
3. "How do I get help or see the full details?"

It must not expose diagnostic evidence, internal notes, staff contact details,
or any complaint that the sender is not entitled to see.

## Current platform findings

The service module already provides the backbone required for this channel.

- `ServiceComplaint` stores a unique complaint number, service status, customer
  and alternate contact fields, assignment timestamps, test/warranty outcomes,
  and closure data.
- `ServiceComplaintActivity` is the chronological audit/timeline record. All
  important workflow writers use `recordComplaintActivity(...)` in the same
  database transaction.
- Customer-visible timeline actions are already explicitly filtered in
  `backend/src/trpc/routes/service-portal.ts`: `raised`, assignment changes,
  visit, test, retest, warranty decision, fulfillment, closure, cancellation,
  and reopen.
- The service portal gives authenticated customers a safe detailed view and
  avoids revealing raw test notes. WhatsApp should deep-link there rather than
  reproduce the entire complaint workspace.
- The repository has no WhatsApp provider adapter, no outbound-delivery queue,
  no webhook endpoint, and no contact-consent/preferences model. The generic
  `Notification` table is internal-user-oriented (`userId`) and is not suitable
  as the customer WhatsApp delivery ledger.
- Bun cron and PostgreSQL are already used by the backend, so a small durable
  worker can be introduced without a second runtime at first.

## Product boundary and release sequence

| Release | Customer experience | Included | Explicitly excluded |
| --- | --- | --- | --- |
| 1 — updates | Proactive templated messages and a portal link | registration, assignment, visit, test, warranty, fulfillment, closure/reopen/cancel updates; delivery audit; opt-out | free-text support, AI replies, WhatsApp complaint creation |
| 2 — guided self-service | A customer can ask for status or help from the registered number | verified sender matching, complaint-number lookup, short menu/buttons, portal link, human handoff ticket | changes to complaint status, diagnostic decisions, unverified lookup |
| 3 — assisted intake | A guided flow can collect a new complaint request | authenticated/OTP-bound intake, structured fields, media staging, duplicate/serial checks, human review where needed | unconstrained AI-created complaints or automatic warranty decisions |

Release 1 is the recommended implementation start. It delivers the requested
updates with the lowest operational and privacy risk. Releases 2 and 3 should
not start until its delivery, opt-out, and support-handoff metrics are stable.

## Canonical architecture

```text
Service mutation
    -> ServiceComplaint + ServiceComplaintActivity (one DB transaction)
    -> Service WhatsApp outbox row (same transaction; selected customer events)
    -> scheduled worker claims row
    -> provider adapter -> WhatsApp Business API
    -> provider delivery/read webhook -> message ledger

Customer WhatsApp reply
    -> verified webhook -> inbound ledger + sender/contact match
    -> deterministic command/menu -> portal deep link or support handoff
```

One primary path governs each concern:

- Service routes change complaint state and record activities; they never call a
  WhatsApp provider directly.
- The outbox translates selected canonical activities into messages; it never
  changes a complaint's state.
- The provider adapter owns HTTP credentials, template calls, retries, and
  provider-specific payloads.
- The webhook handler records provider delivery events and inbound messages;
  it never trusts a phone number alone to disclose complaint details.
- The portal remains the authenticated detail view. WhatsApp messages contain a
  short status and a deep link, not sensitive operational detail.

## Event and template catalogue

Start with one notification per meaningful, customer-visible state change. Do
not notify on internal edits, line-note edits, form submissions, or ordinary
assignment reshuffles unless the change affects the customer experience.

| Canonical activity / condition | Customer-facing message intent | Release 1 default |
| --- | --- | --- |
| `raised` | complaint number, acknowledgement, tracking link | Send |
| `assign` | service representative assigned; no personal phone number | Send |
| `reassign` | team update only when the assigned representative actually changes | Send only if changed |
| `visit_logged` | visit/inspection recorded; next update follows testing | Send |
| `test_submitted` + `needs_retest` | more testing is required | Send |
| `test_submitted` + `warranty_candidate` | assessment is complete and warranty review is under way | Send |
| `tested_ok_close` | assessment/closure outcome and portal link | Send |
| `warranty_approve` | warranty approved; fulfillment timing is communicated separately | Send |
| `warranty_reject` | warranty decision and a portal link for the decision | Send |
| `replacement_order_created` / `replacement_invoice_created` | replacement reference and fulfillment update | Send |
| `telephonic_close`, `cancel`, `reopen` | final/reopened state acknowledgement | Send |
| happy-calling activity | service follow-up invitation | Defer to a later, separately approved campaign |

Each template uses only: brand name, complaint number, a customer-safe status
sentence, a safe fulfilment reference when applicable, and a short portal URL.
No serial number, diagnostic cause, address, internal staff notes, or warranty
calculation belongs in the initial template catalogue.

## Data model for the future implementation

Add these service-scoped models in `schema.prisma`; names are provisional and
should be finalised in the implementation decision.

| Model | Purpose | Important constraints |
| --- | --- | --- |
| `WhatsAppBusinessAccount` | organization/provider configuration, encrypted credentials reference, sender number, enabled state | unique organization + sender; secret values never returned by APIs |
| `ServiceWhatsAppContact` | E.164 phone identity, consent state/source/time, preferred language, opt-out time | unique `(orgId, normalizedPhone)`; consent is append-only/auditable |
| `ServiceWhatsAppOutbox` | pending message created with a complaint activity | unique `(activityId, messageKind, recipientContactId)` for idempotency; payload/template/version snapshot; retry state and scheduled/claimed timestamps |
| `ServiceWhatsAppMessage` | provider message ID, send/delivery/read/failure outcomes and immutable audit | unique provider message ID; references outbox and complaint; provider error code stored safely |
| `ServiceWhatsAppInboundMessage` | deduplicated inbound webhook record and routing result | unique provider message ID; raw payload encrypted/redacted; no state-changing command without verified identity |
| `ServiceSupportHandoff` | a human-owned support queue item with SLA/status | links inbound conversation/complaint; no hidden alternate resolution path |

Phone numbers are normalized to E.164 once at the boundary. The original
complaint contact remains a historical snapshot; send eligibility is resolved
through `ServiceWhatsAppContact` so opt-out takes effect immediately.

The recipient rule for Release 1 is **one opted-in primary customer contact per
complaint**. `customerPhone` is the candidate number; `alternatePhone` is never
used automatically. For `on_behalf_of` complaints, notification of the named
third party requires an explicit product-policy decision and separate consent;
do not infer it from a free-text field.

## Implementation design

### 1. Event creation and transaction safety

Extend the common service activity path, or add a narrow companion helper used
by the same transactions, to enqueue only mapped customer events. It must use
the existing `Prisma.TransactionClient` so a notification is created exactly
when the corresponding service activity commits.

The mutation response must not wait for provider delivery. If WhatsApp is down,
the complaint transition succeeds and the worker retries the durable outbox
row. A failed message is visible to support/admin users, not silently dropped.

### 2. Worker and retries

Add a small cron-invoked worker that claims due outbox rows with a database-safe
lease (`FOR UPDATE SKIP LOCKED` or equivalent) and sends through a provider
interface. Use exponential backoff with a bounded attempt count, then mark the
message `failed` for manual retry. A separate recovery job releases expired
leases. The worker must tolerate multiple backend instances without duplicate
sends.

Initial provider interface:

```ts
interface WhatsAppProvider {
  sendTemplate(input: WhatsAppTemplateSend): Promise<{ providerMessageId: string }>;
  verifyWebhook(input: Request): Promise<VerifiedWhatsAppWebhook>;
}
```

Choose the WhatsApp Business Platform provider during Phase 0. Meta's direct
Cloud API is the default evaluation candidate, but the application should be
behind this adapter so an approved BSP can be substituted without changing
service workflow code. Verify current provider terms, templates, pricing,
opt-in requirements, webhook signatures, and country availability during
onboarding; do not encode assumptions from this document as policy.

### 3. Webhook endpoints

Mount a dedicated, public, provider-specific endpoint outside tRPC, for example
`/webhooks/whatsapp`. It needs:

- GET verification handled only according to the chosen provider's challenge
  contract.
- POST signature verification against the raw request body before JSON parsing
  or processing.
- provider event/message-ID deduplication before side effects.
- a fast acknowledgement after durable receipt; slower work is queued.
- strict structured logs with phone numbers and message bodies redacted.
- rate limiting, payload-size limits, secret rotation, and alerting for
  repeated signature failures.

### 4. Inbound bot: Release 2

Inbound handling begins with deterministic messages, not an LLM:

- `STATUS <complaint number>` returns a generic status only after the sender
  matches an opted-in contact for that exact complaint. Otherwise send a portal
  login/tracking link without confirming that a complaint exists.
- Buttons/list messages provide **Track complaint**, **Talk to support**,
  **Stop updates**, and **Help**.
- `STOP`, `UNSUBSCRIBE`, and provider-native opt-out signals immediately update
  the contact preference and suppress future outbound sends.
- **Talk to support** creates a `ServiceSupportHandoff` tied to the inbound
  conversation. The chosen internal team owns its SLA and resolves it through
  the existing service workspace or a deliberately added support queue.

An optional LLM may later classify free text into those deterministic intents,
but must not read raw complaint content, disclose data, change a service state,
or create warranty outcomes without an authenticated and audited action.

### 5. Internal operational surface

Add a service-admin WhatsApp settings/operations view, permission-gated under a
new explicit service messaging permission. It should show account health,
template status/version, consent state, per-complaint delivery history, failed
messages/retry control, opt-out, and handoff queue. It must not reveal provider
secrets or allow arbitrary free-text broadcasts in the first release.

## Security, privacy, and reliability rules

- Require a recorded, policy-valid opt-in before sending updates. Preserve who,
  when, how, and what wording was accepted; honor opt-out immediately.
- Encrypt provider credentials and any stored raw webhook body; keep only the
  minimum message content needed for audit/support and redact logs.
- Scope every contact, message, webhook lookup, and handoff by `orgId`. Never
  let a provider message ID or phone lookup cross tenants.
- Treat a matching phone number as a contact lookup, not complete
  authentication. Use portal authentication or a short-lived OTP for sensitive
  details and for Release 3 complaint intake.
- Use immutable activity and template/payload snapshots so message history can
  be explained after templates or complaint details change.
- Enforce idempotency at three layers: activity-to-outbox unique constraint,
  worker claim/lease, and provider/webhook message ID uniqueness.
- Keep provider status (`sent`, `delivered`, `read`, `failed`) separate from
  service status. Provider delivery must never change a complaint lifecycle.
- Add retention/deletion requirements to the privacy policy and ensure they
  cover contact preferences, inbound content, and provider receipts.

## Phased delivery plan

### Phase 0 — product and provider decisions

Owner: service product owner + operations + engineering.

- Confirm business account/provider, verified sender number, countries,
  languages, legal/consent wording, template names and copy, support owners,
  operating hours, and escalation SLA.
- Decide the explicit consent capture point: portal registration, complaint
  creation, customer-support assisted opt-in, or a verified WhatsApp flow.
- Decide whether customers can receive assignment identity, fulfillment
  reference, and third-party complainant updates.
- Produce a template review sheet with variable definitions, fallback copy,
  approved language versions, and portal-link domain.

Exit gate: approved provider credentials in a secret store, approved templates,
and named owners for support/handoff and data/privacy policy.

### Phase 1 — durable outbound updates

Owner: backend/service team.

- Implement schema, contact/consent administration, outbox, adapter, worker,
  provider delivery webhook, metrics, and internal delivery view.
- Wire only the Release 1 event catalogue from the canonical activity path.
- Create unit tests for event mapping, tenant scope, consent/opt-out,
  idempotency, retry/backoff, template snapshot, signature rejection, and
  provider status transitions; add integration tests using a fake provider.
- Pilot with one sender, one organization, one language, and a small
  explicitly opted-in customer cohort.

Exit gate: no duplicate sends in load/retry tests, 100% traceability from
activity to message outcome, successful opt-out test, and support approval of
template wording.

### Phase 2 — inbound status and handoff

Owner: service operations + backend + web.

- Add verified inbound ledger, deterministic commands/buttons, complaint
authorization checks, opt-out parsing, and the human handoff queue.
- Add operational dashboards for unresolved handoffs and webhook failures.
- Test unknown, spoofed, opted-out, cross-tenant, repeated, and malformed
messages plus human-handoff SLA reporting.

Exit gate: no complaint detail is exposed to unverified/unmatched senders and
all handoffs have a visible assigned owner/SLA.

### Phase 3 — guided complaint intake

Owner: product + service operations + backend + portal team.

- Design OTP/auth linking, structured field capture, image/media upload
staging, serial/product validation, and duplicate complaint handling.
- Reuse `createServiceComplaint(...)` as the only complaint creation path;
the bot becomes an adapter, not a competing workflow.
- Run a limited pilot with manual review before allowing automatic creation.

Exit gate: all create/update actions are authenticated, auditable, idempotent,
and produce the same complaint/activity data as the portal.

## Acceptance metrics

Track these from the initial pilot onward:

- activity-to-outbox creation success rate;
- provider accepted, delivered, read, failed, and exhausted-retry rates;
- duplicate-send rate (target: zero);
- time from committed service activity to send attempt;
- opt-out rate and top handoff reasons;
- handoff first-response and resolution SLA;
- portal-link completion rate; and
- webhook signature failure and unmatched-sender rate.

## Decisions required before implementation

1. Which WhatsApp provider/account and sender number will Syrex use?
2. Where is explicit customer opt-in collected and how is its wording approved?
3. Which languages are required for templates and support?
4. Who owns human handoff, and what are their service hours/SLA?
5. Should a third-party complainant receive updates, or only the primary
   customer contact?
6. Is the desired first milestone limited to proactive updates, or must it
   include inbound status lookup and agent handoff from day one?
