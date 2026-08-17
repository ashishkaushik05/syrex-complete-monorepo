import { describe, expect, it } from "bun:test";
import { warehousesRouter } from "./warehouses";
import { ACTOR_ID, makeCtx, WAREHOUSE_A } from "./__testkit__";

// ASVF + scope for the warehouses router (P1 — warehouse scope is the confinement source
// for managers across orders/inventory/invoices). The scope axis: a global actor (admin)
// sees all + filters freely; a non-global manager is pinned to warehouses they manage, and
// reading someone else's warehouse returns NOT_FOUND (the probing rule), never FORBIDDEN.
// Activation validation (manager + active warehouse-type billing profile) is the flow gate.

const MANAGER_ID = ACTOR_ID;
const PROFILE_ID = "b1110000-0000-4000-8000-000000000001";
const defined = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

function warehouseRow(over: Record<string, unknown> = {}) {
  return {
    id: WAREHOUSE_A,
    name: "North DC",
    location: "Delhi",
    address: null,
    managerId: MANAGER_ID,
    billingProfileId: null,
    manager: null,
    billingProfile: null,
    isActive: false,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

type WhMockOpts = {
  rows?: Record<string, unknown>[];
  byId?: Record<string, unknown> | null;
  manager?: Record<string, unknown> | null;
  profile?: { profileType: string; isActive: boolean } | null;
};

function whPrisma(opts: WhMockOpts = {}) {
  const captured: { listWhere?: Record<string, unknown>; create?: Record<string, unknown>; update?: Record<string, unknown> } = {};
  const prisma = {
    warehouse: {
      findMany: async (args: { where: Record<string, unknown>; take: number }) => {
        captured.listWhere = args.where;
        return (opts.rows ?? []).slice(0, args.take);
      },
      findUnique: async () => ("byId" in opts ? opts.byId ?? null : warehouseRow()),
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return warehouseRow(defined(args.data));
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return warehouseRow(defined(args.data));
      },
    },
    user: { findUnique: async () => opts.manager ?? null },
    billingProfile: { findUnique: async () => opts.profile ?? null },
  };
  return { prisma, captured };
}

const READ = ["warehouses:read"];
const WRITE = ["warehouses:write"];

// ---------------------------------------------------------------------------
// list / getById scope
// ---------------------------------------------------------------------------

describe("warehouses.list scope", () => {
  it("rejects without warehouses:read (Auth)", async () => {
    const { prisma } = whPrisma();
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.list({ limit: 20 })).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("lets a global admin filter by an arbitrary manager", async () => {
    const { prisma, captured } = whPrisma({ rows: [] });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: ["*"], prisma }));
    await caller.list({ limit: 20, managerId: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
    expect(captured.listWhere!.managerId).toBe("ffffffff-ffff-4fff-8fff-ffffffffffff");
  });

  it("pins a non-global manager to their own id regardless of the filter", async () => {
    const { prisma, captured } = whPrisma({ rows: [] });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await caller.list({ limit: 20, managerId: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
    expect(captured.listWhere!.managerId).toBe(ACTOR_ID);
  });
});

describe("warehouses.getById scope (probing rule)", () => {
  it("returns NOT_FOUND for a missing warehouse", async () => {
    const { prisma } = whPrisma({ byId: null });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: ["*"], prisma }));
    await expect(caller.getById({ id: WAREHOUSE_A })).rejects.toThrow(/not found/i);
  });

  it("returns NOT_FOUND (not FORBIDDEN) when a manager reads another's warehouse", async () => {
    const { prisma } = whPrisma({ byId: warehouseRow({ managerId: "someone-else" }) });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    const err = await caller.getById({ id: WAREHOUSE_A }).catch((e) => e);
    expect(String(err.message)).toMatch(/not found/i);
    expect(String(err.code ?? err.message)).not.toMatch(/FORBIDDEN/);
  });

  it("returns the warehouse a manager actually owns", async () => {
    const { prisma } = whPrisma({ byId: warehouseRow({ managerId: ACTOR_ID }) });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.getById({ id: WAREHOUSE_A })).resolves.toMatchObject({ id: WAREHOUSE_A });
  });

  it("lets an admin read any warehouse", async () => {
    const { prisma } = whPrisma({ byId: warehouseRow({ managerId: "someone-else" }) });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: ["*"], prisma }));
    await expect(caller.getById({ id: WAREHOUSE_A })).resolves.toMatchObject({ id: WAREHOUSE_A });
  });
});

// ---------------------------------------------------------------------------
// create — activation validation
// ---------------------------------------------------------------------------

const baseCreate = { name: "North DC", location: "Delhi" };

describe("warehouses.create", () => {
  it("rejects without warehouses:write (Auth)", async () => {
    const { prisma } = whPrisma();
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.create(baseCreate)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects an unknown managerId (Failure)", async () => {
    const { prisma } = whPrisma({ manager: null });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create({ ...baseCreate, managerId: MANAGER_ID })).rejects.toThrow(/Invalid managerId/i);
  });

  it("creates an inactive warehouse without requiring a manager", async () => {
    const { prisma, captured } = whPrisma();
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await caller.create(baseCreate);
    expect(captured.create!.isActive).toBe(false);
  });

  it("rejects activating without a manager (Validation)", async () => {
    const { prisma } = whPrisma();
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create({ ...baseCreate, isActive: true })).rejects.toThrow(/requires an assigned manager/i);
  });

  it("rejects activating without a billing profile (Validation)", async () => {
    const { prisma } = whPrisma({ manager: { id: MANAGER_ID } });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(
      caller.create({ ...baseCreate, isActive: true, managerId: MANAGER_ID }),
    ).rejects.toThrow(/requires a billing profile/i);
  });

  it("rejects activating with a non-warehouse or inactive billing profile (Validation)", async () => {
    const { prisma } = whPrisma({ manager: { id: MANAGER_ID }, profile: { profileType: "company", isActive: true } });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(
      caller.create({ ...baseCreate, isActive: true, managerId: MANAGER_ID, billingProfileId: PROFILE_ID }),
    ).rejects.toThrow(/must be active and have type warehouse/i);
  });

  it("activates with a valid manager + active warehouse profile", async () => {
    const { prisma, captured } = whPrisma({ manager: { id: MANAGER_ID }, profile: { profileType: "warehouse", isActive: true } });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await caller.create({ ...baseCreate, isActive: true, managerId: MANAGER_ID, billingProfileId: PROFILE_ID });
    expect(captured.create!.isActive).toBe(true);
  });
});

describe("warehouses.update", () => {
  it("returns NOT_FOUND for a missing warehouse (Failure)", async () => {
    const { prisma } = whPrisma({ byId: null });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: WAREHOUSE_A, name: "X" })).rejects.toThrow(/not found/i);
  });

  it("re-checks activation config when flipping isActive true (Validation)", async () => {
    const { prisma } = whPrisma({ byId: warehouseRow({ managerId: null, billingProfileId: null }) });
    const caller = warehousesRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: WAREHOUSE_A, isActive: true })).rejects.toThrow(/requires an assigned manager/i);
  });
});
