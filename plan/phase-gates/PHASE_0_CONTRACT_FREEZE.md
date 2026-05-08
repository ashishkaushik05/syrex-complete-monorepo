# Phase 0 Contract Freeze

Status: `frozen`
Date: `2026-05-08`
Backend commit: `7565941`

## Scope
This artifact freezes base backend conventions delivered in Phase 0.
Frontend can integrate base transport/error/client behavior using this document.

## Frozen Procedure List
1. `GET /health`
2. `GET /ready`
3. `tRPC query: system.conventions`

## HTTP Endpoints
### `GET /health`
- Success `200`
```json
{ "status": "ok" }
```

### `GET /ready`
- Success `200`
```json
{ "status": "ready" }
```
- Failure `503`
```json
{ "status": "not_ready" }
```

## tRPC Conventions Contract
### Procedure
- `system.conventions` (query)

### Response Snapshot
See [phase0_system_conventions.json](/home/ashish/Documents/code/syrex-new-api/plan/phase-gates/snapshots/phase0_system_conventions.json)

### Shape Summary
- `timezonePolicy`: `UTC_ISO_8601`
- `decimalTransport`: `string`
- `pagination.style`: `cursor`
- `pagination.defaultLimit`: `25`
- `pagination.maxLimit`: `100`
- `errors`: `BAD_REQUEST | CONFLICT | NOT_FOUND | UNAUTHORIZED | FORBIDDEN | INTERNAL`

## Error Shape (tRPC)
All tRPC errors include a `data.requestId` field injected by server formatter.
Frontend wrappers must preserve and log this `requestId`.

## Pagination Contract
Cursor pagination is the default for list endpoints:
- `cursor`: `string | null | undefined`
- `limit`: `number` in `[1..100]`, default `25`

## Datetime and Decimal Contract
- Datetime transport: UTC ISO-8601 strings.
- Decimal transport: strings across all finance/inventory payloads.

## Frontend Gate Checklist
1. Base API client points to `/trpc`.
2. tRPC error wrapper surfaces `data.requestId`.
3. Shared pagination helper aligned to cursor contract.
4. Decimal parser/formatter path uses string transport.
5. Date utilities treat API timestamps as UTC ISO strings.

## Backend Smoke Validation Command
Run:

```bash
./backend/scripts/phase0-smoke.sh
```

This validates live responses for `/health`, `/ready`, and `system.conventions` using a local Postgres Docker container.
