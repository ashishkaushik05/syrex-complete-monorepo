# Batch 04 — Service Module: IDOR & Org Isolation

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

## Decision context
- **D-04:** No `orgId` on `User` model. Org context comes from `ctx.actor.orgId`. Fix the missing filters in every query, not the model.
- **Contract change to coordinate with Web/Mobile:** today `assertOrgAccess(ctx.actor.orgId, record.orgId)` throws `FORBIDDEN` on wrong-org. The new pattern returns `NOT_FOUND` (no info leak). Web/Mobile error handling that checks for `FORBIDDEN` on service routes must be updated. Note this in the decision-log entry and ping the web/mobile owners.
- **M-09 is already resolved in `trpc.ts:107-112`** (expiry IS enforced at auth time). This batch only adds the creation-time `expiresAt` guard.

## Files you will touch
- `backend/src/trpc/routes/service-complaints.ts`
- `backend/src/trpc/routes/service-warranty.ts`
- `backend/src/trpc/routes/service-tests.ts`
- `backend/src/trpc/routes/service-assignments.ts`
- `backend/src/trpc/routes/service-forms.ts`
- `backend/src/trpc/routes/service-integrations.ts`

## Do NOT touch
`service-shared.ts` (read-only; do not change `assertOrgAccess`). Orders/dispatches — Batch 07. Schema — Batch 08. Outlet routes — Batch 03.

---

## The core IDOR pattern (apply to every procedure below)

**Broken:**
```typescript
const record = await ctx.prisma.someModel.findUnique({ where: { id: input.id } });
assertOrgAccess(ctx, record.orgId); // checked AFTER fetch
```

**Correct:**
```typescript
const orgId = ctx.actor.orgId;
if (!orgId) throw new TRPCError({ code: "FORBIDDEN", message: "Org context required" });

const record = await ctx.prisma.someModel.findFirst({
  where: { id: input.id, orgId },
});
if (!record) throw new TRPCError({ code: "NOT_FOUND" });
```

Use `findFirst` (not `findUnique`) so `orgId` can sit in `where`. Always return `NOT_FOUND` — never reveal whether the record exists in another org.

---

## Issues to fix

### [C-07 / H-12] Null-orgId leaks all orgs' rows
**Files:** `service-complaints.ts:162`, `service-forms.ts:216`, `service-integrations.ts:56,89`, and every other list/search procedure in the six files.

Every procedure that uses `orgId: ctx.actor.orgId ?? undefined` (or `?? null`) is broken: a null actor orgId removes the filter. Replace with the null-guard pattern shown above (`if (!orgId) throw FORBIDDEN`) and use the non-null `orgId` throughout the procedure.

### [C-08] IDOR across all service routes
Apply the correct pattern above to every procedure that loads by `id` then checks org. Mapping (line numbers from `ISSUES.md`):

- **service-complaints.ts:** `get` ~235, `detail` ~251, `create` ~352 (use guarded `orgId` in `create.data`), `transition` (scoped `findFirst`).
- **service-warranty.ts:** `approve` ~46, `reject` ~133, `assignReplacement` ~224, `createFulfillmentOrder` ~337 + every other complaint-id-keyed procedure.
- **service-tests.ts:** `submit` ~35, `requestRetest` ~135.
- **service-assignments.ts:** `assign` ~36, `reassign` ~108.
- **service-forms.ts:** `listTemplates` ~216 — null guard. All other procedures with `orgId ?? undefined` — same.
- **service-integrations.ts:** `listClients` ~56, `createClient` ~89 (refuse creation when `orgId` null), every other procedure — null guard.

### [M-09] Service client `expiresAt` not validated at creation
**File:** `backend/src/trpc/routes/service-integrations.ts:72`

Auth-time enforcement is already done (`trpc.ts:107-112`). Add the creation-time check:
```typescript
if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "expiresAt must be in the future" });
}
```

### [M-10] ReDoS in `service-forms` field validation
**File:** `backend/src/trpc/routes/service-forms.ts:34-43`

User-supplied `validationRules.regex` is compiled and executed without bounds.

**Fix:**
```typescript
function validateFieldValue(value: string, field: FormField): boolean {
  const rules = field.validationRules;
  if (rules?.minLength && value.length < rules.minLength) return false;
  if (rules?.maxLength && value.length > rules.maxLength) return false;

  if (rules?.regex) {
    if (rules.regex.length > 200) return false;          // bound regex source length
    if (value.length > 10_000) return false;             // bound input length
    try {
      // Heuristic guard for catastrophic backtracking patterns. This is mitigation,
      // not a full ReDoS defense — Node has no per-regex execution timeout. If form
      // templates start needing complex regexes, switch to a safe engine like RE2.
      if (/(\(.*\+\)\+|\(.*\*\)\*|\(.*\?\)\?)/.test(rules.regex)) return false;
      const re = new RegExp(rules.regex);
      if (!re.test(value)) return false;
    } catch {
      return false;                                       // invalid regex = fail closed
    }
  }
  return true;
}
```

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] `service-complaints.get` with another org's complaint ID returns `NOT_FOUND` (not `FORBIDDEN`)
- [ ] `service-complaints.list` with a null-orgId actor returns `FORBIDDEN`
- [ ] `service-integrations.createClient` with a past `expiresAt` returns `BAD_REQUEST`
- [ ] An expired service client cannot authenticate (already enforced — add a regression test)
- [ ] Form field with a 250-char regex string fails validation gracefully
- [ ] Form field with `(a+)+$` regex is rejected by the heuristic
- [ ] Regression tests cover wrong-org `NOT_FOUND` for at least one procedure in each of the six files
