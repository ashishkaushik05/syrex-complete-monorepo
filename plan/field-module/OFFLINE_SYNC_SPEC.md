# Offline Sync Specification

## Sync Guarantees

The mobile app must provide eventual consistency without data loss.

Guarantees:

- local persistence happens before network writes
- every shift has a stable `clientShiftId`
- every point has a stable `clientPointId`
- batches are replay-safe
- accepted and duplicate backend ids are terminal successful states
- rejected backend ids are terminal failed states with reason
- retryable backend responses keep data pending
- network and 5xx failures keep data pending
- 401 does not delete data

## Point State Machine

```text
pending
  -> in_flight
  -> acked
  -> duplicate
  -> rejected
  -> failed
```

Transitions:

- `pending -> in_flight`: sync worker starts batch upload.
- `in_flight -> acked`: id appears in `accepted`.
- `in_flight -> duplicate`: id appears in `duplicates`.
- `in_flight -> rejected`: id appears in `rejected`; store reason.
- `in_flight -> pending`: network error, timeout, 5xx, retryable response.
- `in_flight -> failed`: non-retryable client or auth failure after recovery attempts.

`acked` and `duplicate` can be compacted by retention policy. `rejected` should remain
visible for diagnostics until reviewed or expired by documented retention.

## Shift State Machine

```text
local_active
  -> syncing_start
  -> server_active
  -> ending_pending
  -> completed
```

Alternate states:

- `conflict`: backend reports active-shift conflict.
- `start_failed_retryable`: start sync failed but local capture continues.
- `end_failed_retryable`: local shift ended but backend end has not synced.

## Sync Worker Loop

1. Load active or ending local shift.
2. If no `serverShiftId`, call `fieldShifts.syncStart`.
3. Store returned `serverShiftId`.
4. Load pending/in-flight-timeout points by `recordedAt`.
5. Upload at most 500 points to `fieldLocation.ingestV2`.
6. Apply ack result transactionally.
7. Report health with `fieldSyncStatus.upsert`.
8. If shift is ending and pending queue is empty or safely retained, call `syncEnd`.
9. Back off on network, 5xx, auth, and retryable states.

## Backoff Rules

Recommended initial values:

- first retry: 5 seconds
- second retry: 15 seconds
- third retry: 30 seconds
- max retry interval: 5 minutes
- reset backoff after successful batch

Use jitter to avoid synchronized retries across devices.

## Auth Failure Handling

On 401:

- do not delete queued rows
- attempt token refresh if refresh credentials exist
- if refresh succeeds, retry normally
- if refresh fails, pause sync and show local/auth health state
- keep capturing if permissions allow and shift remains local-active

## Retryable Shift Handling

If `ingestV2` returns `retryable: true`:

- keep all points pending
- call or retry `syncStart`
- store last error as `SHIFT_NOT_SYNCED`
- report health
- retry ingest after shift has `serverShiftId`

## Queue Retention

Do not silently drop oldest points.

Acceptable retention policy must define:

- max age
- max rows
- compaction target states
- user-visible warning
- supervisor-visible queue state
- audit reason for deletion

Until a policy exists, keep pending and rejected points.

## Visit And Stop Event Sync

If visits and stops must work offline, add event idempotency equivalent to point sync:

- local `clientEventId`
- event payload persisted locally
- backend uniqueness by org, agent, event type, and client event id
- accepted/duplicate/rejected handling
- media upload state for audio/photos before final visit event

Until backend event idempotency exists, the UI must not imply that offline visits/stops
are guaranteed.
