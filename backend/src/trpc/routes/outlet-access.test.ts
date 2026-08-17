import { describe, expect, it } from "bun:test";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { ACTOR_ID, makeCtx, OUTLET_A, WAREHOUSE_A, WAREHOUSE_B } from "./__testkit__";
import {
  actorHasInternalSalesOutletAccess,
  assertOutletAccess,
  assertOutletWarehouseScope,
  assertWarehouseScope,
  findActorLinkedOutletId,
  resolveFinancialScope,
} from "./outlet-access";

describe("actorHasInternalSalesOutletAccess", () => {
  it("returns false when actor id is missing", () => {
    expect(
      actorHasInternalSalesOutletAccess(
        makeCtx({ actorId: null, permissions: [P.outlets.read, P.orders.write], userType: "internal" }),
      ),
    ).toBe(false);
  });

  it("returns false without both outlets:read and orders:write", () => {
    expect(
      actorHasInternalSalesOutletAccess(makeCtx({ permissions: [P.outlets.read], userType: "internal" })),
    ).toBe(false);
    expect(
      actorHasInternalSalesOutletAccess(makeCtx({ permissions: [P.orders.write], userType: "internal" })),
    ).toBe(false);
  });

  it("returns false when userType is not internal", () => {
    expect(
      actorHasInternalSalesOutletAccess(
        makeCtx({ permissions: [P.outlets.read, P.orders.write], userType: "outlet" }),
      ),
    ).toBe(false);
  });

  it("returns true for internal user with both permissions", () => {
    expect(
      actorHasInternalSalesOutletAccess(
        makeCtx({ permissions: [P.outlets.read, P.orders.write], userType: "internal" }),
      ),
    ).toBe(true);
  });
});

describe("findActorLinkedOutletId", () => {
  it("returns the linked outlet id when present", () => {
    expect(findActorLinkedOutletId(makeCtx({ linkedOutletId: OUTLET_A }))).toBe(OUTLET_A);
  });

  it("returns null when no outlet is linked", () => {
    expect(findActorLinkedOutletId(makeCtx({ linkedOutletId: null }))).toBeNull();
  });
});

describe("assertWarehouseScope", () => {
  it("allows super admins regardless of warehouse", () => {
    expect(() =>
      assertWarehouseScope(makeCtx({ permissions: [SUPER_ADMIN_PERMISSION] }), WAREHOUSE_B),
    ).not.toThrow();
  });

  it("allows actors with no managed warehouse (global scope)", () => {
    expect(() => assertWarehouseScope(makeCtx({ managedWarehouseId: null }), WAREHOUSE_A)).not.toThrow();
  });

  it("allows matching warehouse", () => {
    expect(() =>
      assertWarehouseScope(makeCtx({ managedWarehouseId: WAREHOUSE_A }), WAREHOUSE_A),
    ).not.toThrow();
  });

  it("rejects mismatched warehouse", () => {
    expect(() =>
      assertWarehouseScope(makeCtx({ managedWarehouseId: WAREHOUSE_A }), WAREHOUSE_B),
    ).toThrow("Outside managed warehouse scope");
  });

  it("rejects a null resource warehouse for a scoped manager", () => {
    expect(() =>
      assertWarehouseScope(makeCtx({ managedWarehouseId: WAREHOUSE_A }), null),
    ).toThrow("Outside managed warehouse scope");
  });
});

describe("assertOutletWarehouseScope", () => {
  function prismaWithOutlet(warehouseId: string | null | undefined) {
    return {
      outlet: {
        findUnique: async () => (warehouseId === undefined ? null : { warehouseId }),
      },
    };
  }

  it("allows super admins without touching the database", async () => {
    let called = false;
    const prisma = { outlet: { findUnique: async () => { called = true; return null; } } };
    await assertOutletWarehouseScope(
      makeCtx({ permissions: [SUPER_ADMIN_PERMISSION], prisma }),
      OUTLET_A,
    );
    expect(called).toBe(false);
  });

  it("allows actors with no managed warehouse", async () => {
    await expect(
      assertOutletWarehouseScope(makeCtx({ managedWarehouseId: null }), OUTLET_A),
    ).resolves.toBeUndefined();
  });

  it("allows when the outlet belongs to the managed warehouse", async () => {
    await expect(
      assertOutletWarehouseScope(
        makeCtx({ managedWarehouseId: WAREHOUSE_A, prisma: prismaWithOutlet(WAREHOUSE_A) }),
        OUTLET_A,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects when the outlet is in a different warehouse", async () => {
    await expect(
      assertOutletWarehouseScope(
        makeCtx({ managedWarehouseId: WAREHOUSE_A, prisma: prismaWithOutlet(WAREHOUSE_B) }),
        OUTLET_A,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when the outlet does not exist", async () => {
    await expect(
      assertOutletWarehouseScope(
        makeCtx({ managedWarehouseId: WAREHOUSE_A, prisma: prismaWithOutlet(undefined) }),
        OUTLET_A,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("resolveFinancialScope", () => {
  it("grants global access to super admins", () => {
    const scope = resolveFinancialScope(makeCtx({ permissions: [SUPER_ADMIN_PERMISSION] }));
    expect(scope).toEqual({ linkedOutletId: null, hasGlobalAccess: true, isWarehouseScoped: false });
  });

  it("scopes a linked outlet user to their outlet", () => {
    const scope = resolveFinancialScope(makeCtx({ linkedOutletId: OUTLET_A }));
    expect(scope).toEqual({
      linkedOutletId: OUTLET_A,
      hasGlobalAccess: false,
      isWarehouseScoped: false,
    });
  });

  it("marks a warehouse manager as warehouse-scoped", () => {
    const scope = resolveFinancialScope(makeCtx({ managedWarehouseId: WAREHOUSE_A }));
    expect(scope).toEqual({
      linkedOutletId: null,
      hasGlobalAccess: false,
      isWarehouseScoped: true,
    });
  });

  it("throws FORBIDDEN when the actor has no safe scope", () => {
    expect(() => resolveFinancialScope(makeCtx({}))).toThrow("No safe scope available");
  });

  it("honors a custom error message", () => {
    expect(() => resolveFinancialScope(makeCtx({}), { errorMessage: "custom denial" })).toThrow(
      "custom denial",
    );
  });

  it("does NOT grant internal-sales global access unless explicitly opted in", () => {
    const ctx = makeCtx({
      permissions: [P.outlets.read, P.orders.write],
      userType: "internal",
    });
    // Without includeInternalSales the internal user has no linked outlet/warehouse,
    // so there is no safe scope and the helper must deny by default.
    expect(() => resolveFinancialScope(ctx)).toThrow("No safe scope available");
  });

  it("grants global access to internal-sales actors when opted in", () => {
    const scope = resolveFinancialScope(
      makeCtx({ permissions: [P.outlets.read, P.orders.write], userType: "internal" }),
      { includeInternalSales: true },
    );
    expect(scope.hasGlobalAccess).toBe(true);
  });

  it("prefers an explicit linked outlet over warehouse scoping", () => {
    const scope = resolveFinancialScope(
      makeCtx({ linkedOutletId: OUTLET_A, managedWarehouseId: WAREHOUSE_A }),
    );
    expect(scope.linkedOutletId).toBe(OUTLET_A);
    expect(scope.isWarehouseScoped).toBe(false);
  });
});

describe("assertOutletAccess", () => {
  function prisma(ownsOutlet: boolean) {
    return {
      outlet: {
        findFirst: async (args: any) =>
          ownsOutlet && args.where?.id === OUTLET_A && args.where?.userId === ACTOR_ID
            ? { id: OUTLET_A }
            : null,
      },
    };
  }

  it("throws UNAUTHORIZED when actor id is missing", async () => {
    await expect(
      assertOutletAccess(makeCtx({ actorId: null, prisma: prisma(false) }), OUTLET_A),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows the owner of the outlet", async () => {
    await expect(
      assertOutletAccess(makeCtx({ prisma: prisma(true) }), OUTLET_A),
    ).resolves.toBeUndefined();
  });

  it("allows internal sales actors for any outlet", async () => {
    await expect(
      assertOutletAccess(
        makeCtx({
          permissions: [P.outlets.read, P.orders.write],
          userType: "internal",
          prisma: prisma(false),
        }),
        OUTLET_A,
      ),
    ).resolves.toBeUndefined();
  });

  it("allows super admins for any outlet", async () => {
    await expect(
      assertOutletAccess(
        makeCtx({ permissions: [SUPER_ADMIN_PERMISSION], prisma: prisma(false) }),
        OUTLET_A,
      ),
    ).resolves.toBeUndefined();
  });

  it("denies an unrelated actor with no global access", async () => {
    await expect(
      assertOutletAccess(makeCtx({ prisma: prisma(false) }), OUTLET_A),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
