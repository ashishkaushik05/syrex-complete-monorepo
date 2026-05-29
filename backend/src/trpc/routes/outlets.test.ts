import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { outletsRouter } from "./outlets";

type OutletRow = {
  id: string;
  outletCode: string;
  userId: string;
  warehouseId: string | null;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  creditLimit: Prisma.Decimal;
  outstandingBalance: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  legalName?: string | null;
  gstin?: string | null;
  billingAddress1?: string | null;
  billingAddress2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPincode?: string | null;
  billingCountry?: string;
};

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTLET_A = "11111111-1111-4111-8111-111111111111";
const OUTLET_B = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_A = "33333333-3333-4333-8333-333333333333";
const WAREHOUSE_B = "44444444-4444-4444-8444-444444444444";

function makeOutlet(id: string, warehouseId: string | null, createdAtIso: string): OutletRow {
  return {
    id,
    outletCode: `OC-${id.slice(0, 4)}`,
    userId: `u-${id}`,
    warehouseId,
    name: `Outlet ${id.slice(0, 4)}`,
    ownerName: `Owner ${id.slice(0, 4)}`,
    phone: "9999999999",
    address: "Addr",
    creditLimit: new Prisma.Decimal(1000),
    outstandingBalance: new Prisma.Decimal(0),
    isActive: true,
    createdAt: new Date(createdAtIso),
    billingCountry: "India",
  };
}

function matchesContains(value: string, needle: string) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function outletMatchesWhere(outlet: OutletRow, where: any): boolean {
  if (!where) return true;
  if (where.id && outlet.id !== where.id) return false;
  if (where.warehouseId !== undefined && outlet.warehouseId !== where.warehouseId) return false;
  if (where.isActive !== undefined && outlet.isActive !== where.isActive) return false;
  if (where.OR && Array.isArray(where.OR) && where.OR.length > 0) {
    const orMatch = where.OR.some((clause: any) => {
      if (clause.outletCode?.contains) return matchesContains(outlet.outletCode, clause.outletCode.contains);
      if (clause.name?.contains) return matchesContains(outlet.name, clause.name.contains);
      if (clause.ownerName?.contains) return matchesContains(outlet.ownerName, clause.ownerName.contains);
      return false;
    });
    if (!orMatch) return false;
  }
  return true;
}

function createCaller(opts: {
  permissions: string[];
  linkedOutletId: string | null;
  managedWarehouseId: string | null;
  outlets: OutletRow[];
  actorOrgId?: string | null;
}) {
  const prisma = {
    user: {
      findUnique: async (args: any) => {
        if (args.include?.role) {
          return {
            id: ACTOR_ID,
            role: { permissions: opts.permissions },
            managedWarehouse: opts.managedWarehouseId ? { id: opts.managedWarehouseId } : null,
          };
        }
        return { id: ACTOR_ID };
      },
    },
    outlet: {
      findUnique: async (args: any) => {
        if (args.where?.userId) {
          return opts.linkedOutletId ? { id: opts.linkedOutletId } : null;
        }
        return null;
      },
      findMany: async (args: any) => {
        const filtered = opts.outlets
          .filter((row) => outletMatchesWhere(row, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
        const start = args.skip ?? 0;
        const end = start + (args.take ?? filtered.length);
        return filtered.slice(start, end);
      },
      findFirst: async (args: any) => {
        const filtered = opts.outlets.filter((row) => outletMatchesWhere(row, args.where));
        return filtered[0] ?? null;
      },
    },
    invoice: {
      groupBy: async (args: any) =>
        (args.where?.outletId?.in ?? []).map((outletId: string) => ({
          outletId,
          _sum: { amountDue: new Prisma.Decimal(0) },
        })),
      aggregate: async () => ({ _sum: { amountDue: new Prisma.Decimal(0) } }),
    },
  };

  return outletsRouter.createCaller({
    requestId: "test",
    actor: { id: ACTOR_ID, orgId: opts.actorOrgId ?? null },
    prisma: prisma as any,
    permissions: [],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
  } as any);
}

describe("outlets route scoping", () => {
  const outletA = makeOutlet(OUTLET_A, WAREHOUSE_A, "2026-05-20T10:00:00.000Z");
  const outletB = makeOutlet(OUTLET_B, WAREHOUSE_B, "2026-05-19T10:00:00.000Z");

  it("outlet-linked users only see their own outlet in list", async () => {
    const caller = createCaller({
      permissions: [P.outlets.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      outlets: [outletA, outletB],
    });

    const result = await caller.list({ limit: 25 });
    expect(result.items.map((item) => item.id)).toEqual([OUTLET_A]);
  });

  it("warehouse managers are scoped to their warehouse in list", async () => {
    const caller = createCaller({
      permissions: [P.outlets.read],
      linkedOutletId: null,
      managedWarehouseId: WAREHOUSE_A,
      outlets: [outletA, outletB],
    });

    const result = await caller.list({ limit: 25 });
    expect(result.items.map((item) => item.id)).toEqual([OUTLET_A]);
  });

  it("internal users with no derivable safe scope are forbidden in list", async () => {
    const caller = createCaller({
      permissions: [P.outlets.read],
      linkedOutletId: null,
      managedWarehouseId: null,
      outlets: [outletA, outletB],
      actorOrgId: "55555555-5555-4555-8555-555555555555",
    });

    await expect(caller.list({ limit: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("getById returns NOT_FOUND for linked outlet user requesting another outlet", async () => {
    const caller = createCaller({
      permissions: [P.outlets.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      outlets: [outletA, outletB],
    });

    await expect(caller.getById({ id: OUTLET_B })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
