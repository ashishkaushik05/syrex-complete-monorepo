# Observability And Security

## Observability Goals

Operators must be able to answer:

- Is the agent active?
- Is GPS capture working?
- Is the phone online?
- Is sync working?
- Is data queued?
- Is the backend accepting points?
- Is SSE delivering live updates?
- Is there a permission or org-isolation problem?

## Metrics

Backend metrics:

- `field_ingest_batch_count`
- `field_ingest_point_count`
- `field_ingest_accepted_count`
- `field_ingest_duplicate_count`
- `field_ingest_rejected_count`
- `field_ingest_retryable_count`
- `field_ingest_latency_ms`
- `field_sync_start_count`
- `field_sync_end_count`
- `field_sync_status_upsert_count`
- `field_active_agents_count`
- `field_sse_connections`
- `field_sse_broadcast_count`
- `field_sse_broadcast_error_count`

Mobile health metrics sent through sync status:

- pending queue depth
- last captured timestamp
- last sync attempt timestamp
- last received timestamp where known
- last sync error code
- permission summary
- platform
- app version
- battery optimization state where available

Supervisor metrics:

- active agents
- delayed agents
- stale agents
- offline agents
- GPS-disabled agents
- high-queue agents
- average sync latency

## Logs

Sync-critical backend logs must include:

- `requestId`
- `orgId`
- `agentId`
- `shiftId`
- `clientShiftId`
- `deviceId`
- `route`
- `pointCount`
- `acceptedCount`
- `duplicateCount`
- `rejectedCount`
- `retryable`
- `durationMs`
- `errorCode`

Do not log raw full point arrays in normal production logs.

## Alerts

Recommended alerts:

- high Field ingest 5xx rate
- repeated `retryable: true` for same device/shift
- sync queue depth above threshold
- stale active agents above threshold
- no SSE connections while active shifts exist
- SSE broadcast failures
- rejected point spike
- org isolation/auth forbidden spike
- no health updates from active agent for threshold duration

## Security Requirements

### Auth

- All Field routes require authenticated actor context except explicitly public health probes.
- Production Field routes require current JWT/session handling.
- SSE requires bearer auth and must fail closed on invalid or missing auth.
- Token refresh must not leak actor context across orgs.

### Authorization

- Field-enabled internal user is required for mobile Field writes.
- `field:write` is required for own shift/location/attendance writes.
- `field:read` is required for Field reads.
- `field:admin` is required for cross-user views and schedule/attendance management.
- Super-admin wildcard access must remain explicit and auditable.

### Org Isolation

- Write org must be derived from actor context, shift ownership, or explicit authorized org.
- Read org must be resolved through shared helper logic.
- SSE wildcard subscription must be restricted to super-admin or explicitly approved admin behavior.
- Cross-org spoofing through headers must remain blocked.

### Privacy

- Location data is sensitive.
- Export, replay, and diagnostics surfaces should be permission-gated.
- Debug views should not expose more precise location data than the actor is authorized to see.
- Retention and deletion policies must be explicit before automatic point deletion.

## Runbook Requirements

Before production rollout, create an operations runbook that covers:

- how to identify a stale agent
- how to distinguish GPS-disabled from offline
- how to inspect queue backlog
- how to recover a stuck shift
- how to handle auth/session failures
- how to report device-specific battery optimization issues
- escalation owner for backend ingest failures
- escalation owner for mobile capture failures
