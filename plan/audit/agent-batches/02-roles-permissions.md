# Batch 02 — Roles & Permissions Hardening

> **Before you start:** append a `planned` entry to `plan/ai-governance/decision-log/DECISION_LOG.md` for this batch and update its status as you go. See `00-README.md`.

## Decision context
- **D-06:** Outlet role keeps `outlets:read`; scoping (outlet user only sees own outlet) is enforced in `outlets.ts` by Batch 03. **H-01 is resolved by Batch 03**, not here.
- **D-07:** Remove `service:approve` from the Sales role in seed.
- **D-08:** Implement `roles.delete` with guards: cannot delete a system role; cannot delete a role with any users assigned (active or inactive).
- **Convention:** all wildcard permission checks use the `SUPER_ADMIN_PERMISSION` constant from `src/rbac/catalog.ts`, never the literal `"*"`.

## Files you will touch
- `backend/src/trpc/routes/roles.ts`
- `backend/scripts/seed-permissions.ts`
- `backend/scripts/dev-seed.ts`
- `backend/scripts/demo-seed.ts`
- Router index where the roles router is registered (verify `roles.delete` is reachable)

## Do NOT touch
Permission enforcement in outlet/invoice/order routes — Batch 03. Auth middleware — Batch 01. Schema (`onDelete` on `Role` / `User.roleId`) — Batch 08.

---

## Issues to fix

### [C-04] Prevent `roles.update` from escalating to super-admin
**File:** `backend/src/trpc/routes/roles.ts:63-78`

Any holder of `roles:write` can call `roles.update({ permissions: ["*"] })` and gain super-admin access.

**Fix — add two guards in `roles.update`, BEFORE the Prisma update call:**

```typescript
import { SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";

// Wildcard escalation guard
if (input.permissions?.includes(SUPER_ADMIN_PERMISSION) && !ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) {
  throw new TRPCError({ code: "FORBIDDEN", message: "Only super-admins can assign wildcard permission" });
}

// isSystem modification guard
if (input.isSystem !== undefined && !ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) {
  throw new TRPCError({ code: "FORBIDDEN", message: "Only super-admins can modify system role flag" });
}
```

### [H-02] Protect `isSystem` flag in `updateRoleSchema`
**File:** `backend/src/trpc/routes/roles.ts`

`updateRoleSchema` keeps `isSystem: z.boolean().optional()` so super-admins can still set it. Runtime enforcement is done by the C-04 guard above. No schema-shape change needed.

### [D-07] Remove `service:approve` from Sales role seed
**File:** `backend/scripts/seed-permissions.ts`

Find the `SALES_PERMISSIONS` (or equivalent) array and remove `P.service.approve`.
Also scan `backend/scripts/dev-seed.ts` and `backend/scripts/demo-seed.ts` for any inline sales-role permission arrays containing `service:approve` and remove them.

### [D-08 / L-06] Implement `roles.delete` endpoint
**File:** `backend/src/trpc/routes/roles.ts`

```typescript
delete: perm(P.roles.delete)
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const role = await ctx.prisma.role.findUniqueOrThrow({ where: { id: input.id } });

    if (role.isSystem) {
      throw new TRPCError({ code: "FORBIDDEN", message: "System roles cannot be deleted" });
    }

    // Count ALL users (active + inactive). Inactive users still hold a User.roleId FK,
    // so deleting the role would break referential integrity. Batch 08's onDelete: Restrict
    // is the DB safety net; this is the friendly error path.
    const userCount = await ctx.prisma.user.count({ where: { roleId: input.id } });
    if (userCount > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Cannot delete role: ${userCount} user(s) (active or inactive) are still assigned`,
      });
    }

    await ctx.prisma.role.delete({ where: { id: input.id } });
    return { success: true };
  })
```

Verify `P.roles.delete` exists in `src/rbac/catalog.ts`. The audit confirmed it does. If absent, abort and ask before adding a new permission.

### [D-06] Outlet role seed — verify, no code change
**File:** `backend/scripts/seed-permissions.ts`

`outlets:read` and `payments:read` stay in `OUTLET_PERMISSIONS`. Route-level scoping (Batch 03) makes them safe. Add a comment above the array:
```typescript
// outlets:read and payments:read are scoped to the actor's own outlet by
// outlets.ts and invoices.ts (see Batch 03 of the May 2026 audit).
```

---

## Validation checklist
- [ ] `bun run typecheck` passes
- [ ] `roles.update({ permissions: ["*"] })` by a non-super-admin returns `FORBIDDEN`
- [ ] `roles.update({ isSystem: false })` by a non-super-admin returns `FORBIDDEN`
- [ ] `roles.delete` on a system role returns `FORBIDDEN`
- [ ] `roles.delete` on a role with any (active OR inactive) users returns `CONFLICT` with the count
- [ ] `roles.delete` on an unused non-system role succeeds
- [ ] After re-seeding, `service:approve` is not in the Sales role permissions
- [ ] Regression tests exist for the C-04 guards and the `roles.delete` guard paths
