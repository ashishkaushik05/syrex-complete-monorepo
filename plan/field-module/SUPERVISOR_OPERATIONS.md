# Supervisor Operations

## Objective

The supervisor dashboard must become an operational control center. It should explain
Field Sense runtime health, not only show locations and historical rows.

## Current Web Surfaces

Existing dashboard surfaces:

- live map
- schedules
- attendance
- shifts
- shift detail
- visits
- stops

Required additions:

- operations dashboard
- health classification
- visible active-agent truncation
- stale/GPS/offline warnings
- timeline/replay
- diagnostics panel

## Operations Dashboard

Create a Field operations screen with:

- total active agents
- agents online
- agents delayed
- agents stale
- agents offline
- GPS-disabled agents
- agents with queue backlog
- agents with sync errors
- average sync latency
- oldest queue age
- active SSE state

Per-agent table columns:

- agent
- health state
- active shift
- last GPS capture
- last received location
- last sync attempt
- last error
- queue depth
- device id
- platform
- app version
- permission summary
- battery optimization state where available

## Health Classification

Recommended states:

| State | Meaning |
| --- | --- |
| `ACTIVE` | Recent GPS and recent sync, no material queue backlog. |
| `DELAYED` | Sync or GPS is behind but within acceptable tolerance. |
| `STALE` | Last location or sync is too old for active shift expectations. |
| `OFFLINE` | No recent sync and no recent received points. |
| `GPS_DISABLED` | Permission summary or device state indicates GPS/background capture is unavailable. |
| `SHIFT_DESYNC` | Mobile has local shift/queue state that does not match backend active shift. |

Initial thresholds should be configurable:

- active: last received within 2 minutes
- delayed: last received within 10 minutes
- stale: last received older than 10 minutes during active shift
- offline: no received/sync event within 30 minutes during active shift
- high queue: pending queue depth above 500 points

## Live Map Improvements

Required:

- display `activeAgents.hasMore` warning
- show stale badges on markers
- show missing GPS state separately from no active shift
- show last ping timestamp
- show queue depth and last sync error in agent drawer
- cluster markers when agent count grows
- avoid loading all trails by default if active count is high

## Timeline And Replay

Shift replay should show:

- path playback
- visits
- stops
- attendance events
- signal gaps
- sync gaps
- rejected point markers if available

The replay surface should use bounded trail reads and communicate truncation.

## Schedule Permission Alignment

Current desired rule:

- self schedule: `field:write`
- cross-user schedule management: `field:admin`

Web schedule management must not show cross-user edit affordances to users who lack
`field:admin`. Route-level access should reflect the screen behavior:

- either split self schedule and admin schedule routes
- or keep route under `field:read`/`field:write` but gate admin actions inside page

## Pagination Requirements

These surfaces must not silently cap data:

- schedules
- attendance
- visits
- stops
- shifts
- active agents

Acceptable patterns:

- cursor pagination
- load-more button
- date filter with explicit cap
- visible capped-data warning

## REST Shim Cleanup

Remove placeholder Field REST compatibility paths after verifying there are no active callers:

- `/field/agents/active`
- `/field/shifts`
- `/field/shifts/:id/trail`
- `/field/shifts/:id/visits`

Do not remove ambiguous compatibility paths without caller inventory and decision-log scope.
