# QA, Device Testing, And Rollout

## Device Matrix

Minimum Android matrix:

- Android 11
- Android 12
- Android 13
- Android 14 or newer
- Samsung
- Xiaomi
- OnePlus
- Pixel

Optional iOS matrix if iOS release is in scope:

- latest supported iOS major version
- one older supported iOS major version
- foreground, background, locked screen, and low-power mode

## Test Environments

Use at least:

- local dev backend
- staging backend with production-like auth
- staging mobile build
- physical devices with realistic battery settings

## Core Test Scenarios

### Online Shift

- login
- start shift
- capture GPS
- verify supervisor live map
- log visit
- start and end stop
- mark attendance
- end shift
- verify trail and history

### Offline Start

- login with valid session
- disable network
- start shift
- move enough to capture points
- kill and reopen app
- verify local active shift remains
- reconnect
- verify `syncStart`, `ingestV2`, and health sync

### Offline End

- start shift online
- disable network
- capture points
- end shift
- verify local state is `ending_pending`
- reconnect
- verify pending points and `syncEnd` complete

### App Termination

- active shift
- app backgrounded
- app killed
- phone locked
- reopen app
- verify active shift and queue recovery

### Network Failure During Upload

- queue more than one batch
- disconnect during first or second batch
- reconnect
- verify no duplicates and no lost points

### Token Expiry

- active shift
- expire access token
- verify data remains queued
- refresh or re-login
- verify sync resumes

### Server Downtime

- active shift
- stop backend
- continue moving
- restart backend
- verify backlog sync and supervisor health recovery

### Server Auto-Close Conflict

- active shift on mobile
- backend auto-closes or manually closes shift
- device continues with pending points
- verify conflict/diagnostic state and no data loss

## Long-Running Test

Run at least one 8 hour Android shift before production acceptance.

Measure:

- battery drain
- memory growth
- queue size
- sync frequency
- duplicate count
- rejected point count
- stale intervals
- app crash rate
- foreground service survival

Recommended 12 hour test before broad rollout.

## Acceptance Evidence

For each test run, record:

- device model
- OS version
- app build/version
- backend environment
- start/end timestamps
- network changes
- queue depth over time
- last sync error over time
- battery start/end
- screenshots of supervisor health
- backend request/log snippets for representative sync

## Rollout Gates

### Internal Dogfood

Entry:

- local-first runtime implemented
- basic dashboard health implemented
- known blocking crashes fixed

Exit:

- 2 hour shifts pass on at least two Android devices
- no point loss in offline/reconnect tests

### Pilot

Entry:

- 8 hour test passed
- supervisor operations dashboard available
- alerting configured

Exit:

- at least five real shifts complete successfully
- no unresolved data-loss defects
- operations can diagnose stale/offline agents

### Production

Entry:

- all acceptance tests pass
- security review complete
- runbook complete
- monitoring and alert ownership assigned

Exit:

- production monitoring confirms stable sync, queue, and live map behavior
