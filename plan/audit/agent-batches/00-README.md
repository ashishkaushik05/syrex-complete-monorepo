# Backend Audit — Agent Batches

Source audit: `../BACKEND_AUDIT_2026-05-25.md`
Issue tracker: `../ISSUES.md`

---

## Mandatory: before any batch starts

1. Read `plan/ai-governance/decision-log/DECISION_PROTOCOL.md`.
2. Append a new entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for the batch you are about to run.
   Required fields: Decision ID, task, rationale, alternatives considered, exact scope (files/routes), status (`planned` → `in_progress` → final), impact/risk, cleanup actions.
   Update the entry to `in_progress` when you start and to a final state when done.
3. Do not touch files outside this batch's "Files you will touch" list. If you discover a needed change in another file, add it to that batch's plan instead of fixing it in place.
4. After the batch is complete:
   - `bun run typecheck` must pass.
   - Each fix in this batch must have at least one regression test added (vitest / bun test). If the codebase has no test framework wired up yet, declare that explicitly in the decision-log entry and create the framework as part of Batch 09 (where infra hardening lives) — do not silently skip.
   - Update `ISSUES.md` to set the issue rows you fixed to `done`.

---

## Execution DAG (read this before scheduling batches)

```
01 (auth)           ──────────► 05 (field security)
                    └─────────► 09 (infra) — needs JWT before CORS lockdown

08 (schema)         ──┬──────► 03 (org isolation, needs Outlet.orgId)
                      ├──────► 06 (cron, needs CronLock)
                      ├──────► 07 (warranty M-07, needs StockAdjustment fields verified)
                      └──────► 09 (needs UserInvitation removed)

02 (roles)          ── independent
04 (service IDOR)   ── independent
```

Recommended order:

```
1. Batch 08  (schema; everything downstream needs it)
2. Batch 01  (auth; touches every request)
3. Batch 02  (roles)
4. Batch 04  (service IDOR — independent)
5. Batch 03  (outlets/invoices org isolation — needs 08)
6. Batch 05  (field security — needs 01)
7. Batch 06  (field reliability — needs 08)
8. Batch 07  (orders/dispatch/warranty — needs 08)
9. Batch 09  (infra hardening — needs 01 and 08)
```

If parallelizing, the only safe pair is **02 ∥ 04** (no overlap).

---

## Issue → batch mapping for items resolved by removal / scoping

Update `ISSUES.md` to set these explicitly to `done` once the owning batch lands:

| Issue | Resolution |
|-------|------------|
| C-17  | Resolved by Batch 01 (audit log uses verified actor only — see Batch 01 §C-17). |
| H-01  | Resolved by Batch 03 outlet scoping (`outlets:read` stays, route enforces own-outlet-only). |
| H-06  | Resolved by Batch 08 (`UserInvitation` model removed) + Batch 09 (route deleted). |
| H-12  | Resolved by Batch 04 null-orgId guard (same pattern as C-07). |
| L-06  | Resolved by Batch 02 D-08 (`roles.delete` endpoint added). |
| M-09  | **Already fixed in current code** (`trpc.ts:107-112` checks `client.expiresAt`). Mark `wont-fix` / `done`. Batch 04 still adds creation-time guard. |
| M-13  | Resolved by Batch 08 (`UserInvitation` model removed). |
| M-16  | Resolved by Batch 08 (`UserInvitation` model removed). |
| M-17  | Resolved by Batch 08 (`UserInvitation` model removed). |

---

## Cross-batch conventions

- **Wildcard permission checks:** always use `SUPER_ADMIN_PERMISSION` from `src/rbac/catalog.ts`, never the literal `"*"`.
- **Org-scope guards on internal users:** when `ctx.actor.orgId` is null and the actor is not an outlet user, throw `FORBIDDEN` explicitly. Do not use a sentinel value like `"____no_match____"`.
- **NOT_FOUND vs FORBIDDEN:** for IDOR fixes (Batch 04 in particular), return `NOT_FOUND` for both wrong-org and missing record — do not leak the distinction. This IS a contract change vs. the current `assertOrgAccess` which throws `FORBIDDEN`; coordinate with Web/Mobile.
- **Schema changes:** only Batch 08 touches `schema.prisma`. The single exception is the `CronLock` model in Batch 06, which is duplicated in Batch 08 — whichever runs first adds it, the other no-ops.
