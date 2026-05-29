# Batch 08 — Schema Migration

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

This batch owns ALL `schema.prisma` changes (with one exception: Batch 06 may add `CronLock` first — coordinate via the decision-log).
After every change to `schema.prisma`, follow the schema regeneration workaround documented in `CLAUDE.md` ("Prisma schema regeneration") and then `bun run typecheck` from `backend/`.

## Decision context
- **D-05:** Add `orgId String?` to `Outlet`. Backfill from `outlet.warehouse.org`. Outlets with `warehouseId: null` keep `orgId: null` — **do not** make the column required in a follow-up migration unless every outlet is later assigned a warehouse. Document this.
- **D-11:** Soft-delete everywhere. Add `isActive` to entity models that lack it. Skip pure audit/log tables.
- **D-12:** Remove `UserInvitation` entirely. Schema model dropped here, route deleted by Batch 09.
- **D-13:** Keep `@@unique([userId])` on `ShiftSchedule`.

## Files you will touch
- `schema.prisma`
- `backend/scripts/migrate-outlet-orgid.ts` (new one-off backfill script)
- `backend/scripts/migrate-serial-event-orgid.ts` (new one-off backfill script for M-18)

## Do NOT touch
Any `.ts` route or infra file — other batches own those.

---

## Migration order (run as separate `prisma migrate dev` steps so each is rollback-able)

1. Add `CronLock` (skip if Batch 06 already added it).
2. Add `Outlet.orgId String?` + `@@index([orgId])`.
3. Drop `UserInvitation` model + remove `User.invitations` relation field.
4. Add/refine `onDelete` rules on every User FK and on `User.roleId`.
5. Add `isActive Boolean @default(true)` to entity models missing it.
6. Add composite indexes for `isActive` (scoped list below — do not add to all).
7. Update `ServiceSerialEvent` — add `orgId String?` + `@@index([orgId])`, then change unique constraint.
8. Run `backend/scripts/migrate-outlet-orgid.ts`.
9. Run `backend/scripts/migrate-serial-event-orgid.ts`.

---

## Changes

### [C-13] `onDelete` on every User FK
Table — apply exactly this:

| Relation site | Field | onDelete |
|---|---|---|
| `Outlet.userId` | `userId` (`@unique`) | `Cascade` |
| `AuthSession.userId` | `userId` | `Cascade` (already correct) |
| `ShiftSchedule.userId` | `userId` (`@unique`) | `Cascade` |
| `Shift.agentId` | `agentId` | `Restrict` |
| `FieldVisit.agentId` | `agentId` | `Restrict` |
| `FieldStop.agentId` | `agentId` | `Restrict` |
| `FieldSyncStatus.agentId` | `agentId` | `Cascade` |
| `ServiceComplaint.raisedById` | `raisedById` | `SetNull` (column must be `String?`) |
| `StockAdjustment.adjustedById` | `adjustedById` | `SetNull` (column must be `String?`) |
| All `createdById`, `approvedById`, `submittedById`, `assignedById`, `decidedById`, `heldById`, `updatedById`, `updatedBy` audit fields | the FK column | `SetNull` — column must be `String?` |

For any audit field currently typed `String` (non-null), change to `String?` in the same migration step so `SetNull` is valid.

### [C-14] Role FK on User
```prisma
model User {
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Restrict)
  roleId String
}
```
`Restrict` is the DB safety net; Batch 02's `roles.delete` provides the friendly error path.

### [D-05] `Outlet.orgId`
```prisma
model Outlet {
  // ...
  orgId String?
  org   Org?    @relation(fields: [orgId], references: [id], onDelete: SetNull)
  // ...
  @@index([orgId])
}
```

Add `org` back-relation on `Org`: `outlets Outlet[]`.

**Backfill script** `backend/scripts/migrate-outlet-orgid.ts`:
```typescript
import { prisma } from "../src/infra/db/prisma";

const outlets = await prisma.outlet.findMany({
  include: { warehouse: { include: { org: true } } },
});
let updated = 0, skipped = 0;
for (const outlet of outlets) {
  const orgId = outlet.warehouse?.org?.id ?? null;
  if (orgId && outlet.orgId !== orgId) {
    await prisma.outlet.update({ where: { id: outlet.id }, data: { orgId } });
    updated++;
  } else if (!orgId) {
    skipped++;
  }
}
console.log(`Outlet.orgId backfill: updated=${updated} skipped(no-warehouse)=${skipped}`);
```

**Do not** make `orgId` non-nullable in a follow-up migration. Outlets without a warehouse exist legitimately during onboarding; the route-level guards in Batch 03 already throw `FORBIDDEN` when an actor's `orgId` is required but missing, so a null `orgId` outlet simply isn't visible to org-scoped queries — which is the correct behaviour.

### [D-12] Remove `UserInvitation`
1. Delete the `UserInvitation` model from `schema.prisma`.
2. Remove the `invitations` relation field from `User` (if present).
3. Generate migration — Prisma will `DROP TABLE user_invitations`.
4. **Grep step (mandatory before finishing the batch):**
   ```bash
   grep -rn -i "userinvitation\|user_invitation\|invitations\b" backend/ web/ mobile/ schema.prisma
   ```
   Every remaining hit must be deleted or explicitly handed off to Batch 09 / web / mobile. The decision-log entry must list the hits and their resolution.

### [D-11] Soft-delete — `isActive` audit
Add `isActive Boolean @default(true)` only to entity models that currently lack it AND are likely to be soft-deleted (i.e. surfaced in admin UI delete actions). Confirmed candidates from the audit:

- `ServiceComplaintLine`
- `DispatchLine`
- `InvoiceCharge`

Verify each by reading the model first. Do NOT add `isActive` to: `DispatchTimeline`, `ServiceComplaintActivity`, `FieldLocation`, `AuthSession`, `ServiceSerialEvent`, or any other append-only/audit table.

### [H-13] Indexes for `isActive` — scoped list only
Do not blanket-add `@@index([isActive, createdAt])` to every model. Add it ONLY to models where a `WHERE isActive = true ORDER BY createdAt DESC` query actually exists in the codebase. Confirmed candidates (verify with `grep -rn "isActive.*true" backend/src/trpc/routes/`):

- `User` — listing users
- `Outlet` — listing outlets
- `Role` — listing roles
- `Product` — product catalog reads
- `Warehouse` — warehouse list

For models where queries always co-filter by `orgId`, prefer `@@index([orgId, isActive])` instead.

### [M-18] `ServiceSerialEvent` — add orgId + revise unique
1. Add column nullable first:
   ```prisma
   model ServiceSerialEvent {
     // ...
     orgId String?
     @@index([orgId])
   }
   ```
2. Backfill from the related complaint / entity. Script `backend/scripts/migrate-serial-event-orgid.ts`:
   ```typescript
   import { prisma } from "../src/infra/db/prisma";
   const events = await prisma.serviceSerialEvent.findMany({ where: { orgId: null } });
   for (const e of events) {
     // resolve orgId via the entity FK chain — depends on entityType.
     // Pseudocode; adapt to the actual fields on ServiceSerialEvent.
     // ...
   }
   ```
   The agent must inspect the model's relations to decide how to derive `orgId`. If the chain is unclear, abort and ask.
3. After backfill, in a follow-up migration, change unique constraint:
   ```prisma
   @@unique([orgId, normalizedSerial, entityType, entityId, eventType])
   ```
   PostgreSQL treats `NULL` as distinct in unique indexes, so a backfill gap silently re-opens the dup risk this is trying to close — verify the script left no nulls before applying the new constraint.

### [M-19] `ShiftSchedule` uniqueness — no change (D-13)

### [M-20] `FieldVisit.outletId` / `customerId` — document
Add a comment to the model:
```prisma
// Business rule: at least one of (outletId, customerId) must be non-null.
// Enforced in field-visits.ts at creation time (Batch 05).
```
Prisma does not support check constraints natively. A raw-SQL `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` migration could be added in a future hardening pass; out of scope for this batch.

### [C-16 schema part] `CronLock`
If Batch 06 did not add this model first:
```prisma
model CronLock {
  id        String   @id @default(uuid())
  jobName   String
  runKey    String
  lockedAt  DateTime @default(now())

  @@unique([jobName, runKey])
  @@index([lockedAt])
  @@map("cron_locks")
}
```

---

## Validation checklist
- [ ] `prisma validate` passes on the final schema
- [ ] Each migration is its own file (`prisma migrate dev --name <step>`)
- [ ] `bun run typecheck` passes from `backend/` after regeneration
- [ ] All existing outlets with a warehouse have `orgId` populated; outlets without a warehouse have `orgId = null`
- [ ] `UserInvitation` table no longer exists in DB
- [ ] `grep -rn -i "userinvitation\|user_invitation" backend/ web/ mobile/ schema.prisma` returns zero hits (Batch 09 finishes the route deletion)
- [ ] Attempting to delete a `Role` with assigned users returns an FK error (Restrict)
- [ ] All `User`-FK relations have an explicit `onDelete`
- [ ] `ServiceSerialEvent.orgId` populated for every existing row before the new unique is applied
