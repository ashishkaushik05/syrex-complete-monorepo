# Phase 5 — RBAC Enforcement + Hardening: Contract Freeze

**Decision:** DEC-20260509-006  
**Frozen:** 2026-05-09  
**Status:** Enforced — all protected procedures now require explicit permission strings

---

## Permission Matrix

All permission strings use `resource:action` format (colon-separated).

| Permission | Procedures |
|---|---|
| `catalog:read` | brands.list, brands.getById, categories.list, categories.getById, products.list, products.getById, images.list, images.getById |
| `catalog:write` | brands.create, brands.update, categories.create, categories.update, products.create, products.update, images.create, images.update, images.remove |
| `users:read` | users.list, users.getById |
| `users:write` | users.create, users.update |
| `users:invite` | invitations.create, invitations.list, invitations.revoke, invitations.accept |
| `roles:read` | roles.list |
| `roles:write` | roles.create, roles.update |
| `outlets:read` | outlets.list, outlets.getById |
| `outlets:write` | outlets.create, outlets.update |
| `warehouses:read` | warehouses.list, warehouses.getById |
| `warehouses:write` | warehouses.create, warehouses.update |
| `inventory:read` | inventory.stockList |
| `inventory:write` | inventory.createGoodsReceipt, inventory.createStockAdjustment |
| `orders:read` | orders.list, orders.getById |
| `orders:write` | orders.create |
| `orders:manage` | orders.transition (hold, reject, cancel) |
| `orders:approve` | orders.transition (approve action) — additional check within orders:manage |
| `dispatches:read` | dispatches.list, dispatches.getById |
| `dispatches:write` | dispatches.create |
| `dispatches:deliver` | dispatches.markDelivered |
| `invoices:read` | invoices.list, invoices.getById |
| `payments:read` | payments.list, payments.getById |
| `payments:write` | payments.create |
| `attachments:read` | attachments.list, attachments.getById |
| `attachments:write` | attachments.createPending, attachments.confirm, attachments.remove |

**Wildcard:** `"*"` in a role's permissions array bypasses all permission checks. Assigned to Admin.

---

## Default Role Permissions

| Role | Permissions |
|---|---|
| **Admin** | `["*"]` |
| **Sales** | `["orders:read","orders:write","catalog:read","outlets:read","inventory:read","dispatches:read","invoices:read","payments:read","attachments:read","attachments:write"]` |
| **Warehouse Manager** | `["inventory:read","inventory:write","warehouses:read","orders:read","dispatches:read","dispatches:write","dispatches:deliver","attachments:read","attachments:write"]` |

---

## 403 Response Contract

When a user lacks the required permission, the API returns HTTP 403 with the following shape:

```json
{
  "error": {
    "json": {
      "message": "Requires: <permission>",
      "code": "FORBIDDEN",
      "data": {
        "code": "FORBIDDEN",
        "httpStatus": 403,
        "requestId": "<uuid>"
      }
    }
  }
}
```

---

## Idempotency Contract

The following mutations accept an optional `idempotencyKey: string (UUID)` field:

| Procedure | Field | Behavior |
|---|---|---|
| `dispatches.create` | `idempotencyKey` | If a dispatch with this key already exists, returns the existing dispatch immediately without creating a new one |
| `payments.create` | `idempotencyKey` | If a payment with this key already exists, returns the existing payment immediately without creating a new one |

- `idempotencyKey` is globally unique per resource type
- Clients should use a UUID v4 per logical operation
- Omitting the key is valid — the mutation proceeds normally without idempotency protection

---

## Hardening Changes

| Guard | Location | Error |
|---|---|---|
| Negative stock prevention | `inventory.createStockAdjustment` | `BAD_REQUEST: "Stock cannot go below zero"` |
| Dispatch qty overflow | `dispatches.create` (pre-existing guard) | `CONFLICT: "Dispatch quantity exceeds remaining order quantity"` |
| Double-invoice prevention | `orders.transition(approve)` (pre-existing guard) | Idempotent — returns silently if invoice exists |

---

## Auth Procedures (unchanged, no permission required)

| Procedure | Access |
|---|---|
| `auth.login` | Public |
| `auth.refresh` | Public |
| `auth.me` | `protectedProcedure` (authenticated, no permission check) |
| `auth.logout` | `protectedProcedure` (authenticated, no permission check) |
| `system.conventions` | Public |
| `system.health` | Public |

---

## Smoke Validation Commands

```bash
bash backend/scripts/phase5-smoke.sh
```

Key assertions:
- `outlet@syrex.local` (Sales role) calling `inventory.createGoodsReceipt` → FORBIDDEN 403
- `admin@syrex.local` (Admin role) calling same → success
- Duplicate `idempotencyKey` on `dispatches.create` → returns existing dispatch
- Duplicate `idempotencyKey` on `payments.create` → returns existing payment
- Stock adjustment to result in -1 → BAD_REQUEST

---

*Frozen: 2026-05-09. Changes to this contract require updating DEC-20260509-006 and re-running phase5-smoke.sh.*
