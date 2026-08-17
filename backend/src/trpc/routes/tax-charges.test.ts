import { describe, expect, it } from "bun:test";
import { taxChargesRouter } from "./tax-charges";
import { dec, makeCtx } from "./__testkit__";

// ASVF for tax-charges (P1 — these rows ARE the invoice tax math). read sits behind
// billing:read; all mutations behind billing:manage. Validation centres on the rate
// bounds (positive, percentage ≤ 100); the delete path's soft-vs-hard branch (referenced
// by invoices → soft-delete) is the flow that protects historical invoice integrity.

const TC_A = "7a000000-0000-4000-8000-000000000001";

function chargeRow(over: Record<string, unknown> = {}) {
  return {
    id: TC_A,
    name: "GST",
    type: "percentage" as const,
    rate: dec("18"),
    isActive: true,
    displayOrder: 0,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

const defined = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

function taxPrisma(opts: { byId?: Record<string, unknown> | null; rows?: Record<string, unknown>[]; usageCount?: number } = {}) {
  const captured: { create?: Record<string, unknown>; update?: Record<string, unknown>; deleted?: boolean; softDeleted?: boolean } = {};
  const prisma = {
    taxCharge: {
      findMany: async () => opts.rows ?? [],
      findUnique: async () => ("byId" in opts ? opts.byId ?? null : chargeRow()),
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return chargeRow(defined(args.data));
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        if (args.data.isActive === false) captured.softDeleted = true;
        return chargeRow(defined(args.data));
      },
      delete: async () => {
        captured.deleted = true;
        return chargeRow();
      },
    },
    invoiceCharge: { count: async () => opts.usageCount ?? 0 },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma, captured };
}

const READ = ["billing:read"];
const MANAGE = ["billing:manage"];

describe("taxCharges.list", () => {
  it("rejects without billing:read (Auth)", async () => {
    const { prisma } = taxPrisma();
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.list()).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("returns rates formatted to 2dp", async () => {
    const { prisma } = taxPrisma({ rows: [chargeRow({ rate: dec("18") })] });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    const out = await caller.list();
    expect(out.items[0].rate).toBe("18.00");
  });
});

describe("taxCharges.create", () => {
  const input = { name: "GST", type: "percentage" as const, rate: "18" };

  it("requires billing:manage, not just read (Auth)", async () => {
    const { prisma } = taxPrisma();
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.create(input)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects a non-positive rate (Validation)", async () => {
    const { prisma } = taxPrisma();
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.create({ ...input, rate: "0" })).rejects.toThrow(/must be positive/i);
  });

  it("rejects a percentage rate over 100 (Validation)", async () => {
    const { prisma } = taxPrisma();
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.create({ ...input, rate: "150" })).rejects.toThrow(/cannot exceed 100/i);
  });

  it("allows a fixed rate above 100", async () => {
    const { prisma, captured } = taxPrisma();
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await caller.create({ name: "Freight", type: "fixed", rate: "500" });
    expect(captured.create!.name).toBe("Freight");
  });
});

describe("taxCharges.update", () => {
  it("returns NOT_FOUND for a missing charge (Failure)", async () => {
    const { prisma } = taxPrisma({ byId: null });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.update({ id: TC_A, name: "X" })).rejects.toThrow(/not found/i);
  });

  it("re-validates the 100 cap against the resolved type when only the rate changes", async () => {
    const { prisma } = taxPrisma({ byId: chargeRow({ type: "percentage" }) });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.update({ id: TC_A, rate: "120" })).rejects.toThrow(/cannot exceed 100/i);
  });

  it("allows a 120 rate when switching the type to fixed in the same call", async () => {
    const { prisma, captured } = taxPrisma({ byId: chargeRow({ type: "percentage" }) });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await caller.update({ id: TC_A, type: "fixed", rate: "120" });
    expect(captured.update).toBeDefined();
  });
});

describe("taxCharges.delete", () => {
  it("hard-deletes an unused charge", async () => {
    const { prisma, captured } = taxPrisma({ byId: chargeRow(), usageCount: 0 });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    const out = await caller.delete({ id: TC_A });
    expect(out.deleted).toBe(true);
    expect(captured.deleted).toBe(true);
    expect(captured.softDeleted).toBeUndefined();
  });

  it("soft-deletes a charge referenced by invoices (protects history)", async () => {
    const { prisma, captured } = taxPrisma({ byId: chargeRow(), usageCount: 3 });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    const out = await caller.delete({ id: TC_A });
    expect(out.deleted).toBe(true);
    expect(captured.softDeleted).toBe(true);
    expect(captured.deleted).toBeUndefined();
  });

  it("returns NOT_FOUND for a missing charge (Failure)", async () => {
    const { prisma } = taxPrisma({ byId: null });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.delete({ id: TC_A })).rejects.toThrow(/not found/i);
  });
});

describe("taxCharges.reorder", () => {
  it("persists the new order and returns the reordered list", async () => {
    const { prisma } = taxPrisma({ rows: [chargeRow({ id: TC_A })] });
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    const out = await caller.reorder({ orderedIds: [TC_A] });
    expect(out.items).toHaveLength(1);
  });

  it("rejects an empty ordering (Validation)", async () => {
    const { prisma } = taxPrisma();
    const caller = taxChargesRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.reorder({ orderedIds: [] })).rejects.toThrow();
  });
});
