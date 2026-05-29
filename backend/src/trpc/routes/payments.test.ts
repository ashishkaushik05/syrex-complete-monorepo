import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { paymentsRouter } from "./payments";

type PaymentRow = {
  id: string;
  outletId: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  reference: string | null;
  description: string | null;
  createdAt: Date;
  allocations: Array<{
    id: string;
    invoiceId: string;
    amount: Prisma.Decimal;
    allocatedAt: Date;
  }>;
};

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTLET_A = "11111111-1111-4111-8111-111111111111";
const OUTLET_B = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_A = "33333333-3333-4333-8333-333333333333";
const WAREHOUSE_B = "44444444-4444-4444-8444-444444444444";
const PAYMENT_A = "77777777-7777-4777-8777-777777777777";
const PAYMENT_B = "88888888-8888-4888-8888-888888888888";

function makePayment(id: string, outletId: string): PaymentRow {
  return {
    id,
    outletId,
    amount: new Prisma.Decimal(1000),
    paymentDate: new Date("2026-05-20T10:00:00.000Z"),
    reference: "REF-1",
    description: null,
    createdAt: new Date("2026-05-20T10:00:00.000Z"),
    allocations: [],
  };
}

function matchesContains(value: string | null, needle: string) {
  return (value ?? "").toLowerCase().includes(needle.toLowerCase());
}

function matchesWhere(
  payment: PaymentRow,
  where: any,
  outletWarehouseById: Record<string, string | null>,
): boolean {
  if (!where) return true;
  if (where.AND && Array.isArray(where.AND)) {
    return where.AND.every((clause: any) => matchesWhere(payment, clause, outletWarehouseById));
  }
  if (where.OR && Array.isArray(where.OR)) {
    return where.OR.some((clause: any) => matchesWhere(payment, clause, outletWarehouseById));
  }
  if (where.id && payment.id !== where.id) return false;
  if (where.outletId && payment.outletId !== where.outletId) return false;
  if (where.reference?.contains && !matchesContains(payment.reference, where.reference.contains)) return false;
  if (where.description?.contains && !matchesContains(payment.description, where.description.contains)) return false;
  if (where.outlet?.warehouseId) {
    const warehouseId = outletWarehouseById[payment.outletId] ?? null;
    if (warehouseId !== where.outlet.warehouseId) return false;
  }
  return true;
}

function createCaller(opts: {
  permissions: string[];
  linkedOutletId: string | null;
  managedWarehouseId: string | null;
  payments: PaymentRow[];
  outletWarehouseById: Record<string, string | null>;
  actorOrgId?: string | null;
}) {
  const prisma = {
    user: {
      findUnique: async (args: any) => {
        if (args.include?.role) {
          return {
            id: ACTOR_ID,
            isActive: true,
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
    },
    outletPayment: {
      findMany: async (args: any) => {
        const filtered = opts.payments.filter((payment) =>
          matchesWhere(payment, args.where, opts.outletWarehouseById),
        );
        const start = args.skip ?? 0;
        const end = start + (args.take ?? filtered.length);
        return filtered.slice(start, end);
      },
      findFirst: async (args: any) => {
        return (
          opts.payments.find((payment) =>
            matchesWhere(payment, args.where, opts.outletWarehouseById),
          ) ?? null
        );
      },
    },
  };

  return paymentsRouter.createCaller({
    requestId: "test",
    actor: { id: ACTOR_ID, orgId: opts.actorOrgId ?? null, sessionId: null },
    prisma: prisma as any,
    permissions: [],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "203.0.113.10",
  } as any);
}

describe("payments route scoping", () => {
  const payments = [
    makePayment(PAYMENT_A, OUTLET_A),
    makePayment(PAYMENT_B, OUTLET_B),
  ];
  const outletWarehouseById = {
    [OUTLET_A]: WAREHOUSE_A,
    [OUTLET_B]: WAREHOUSE_B,
  };

  it("outlet-linked users only list payments for their outlet", async () => {
    const caller = createCaller({
      permissions: [P.payments.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      payments,
      outletWarehouseById,
    });

    const result = await caller.list({ limit: 25 });
    expect(result.items.map((item) => item.outletId)).toEqual([OUTLET_A]);
  });

  it("getById returns NOT_FOUND for linked outlet user outside own outlet scope", async () => {
    const caller = createCaller({
      permissions: [P.payments.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      payments,
      outletWarehouseById,
    });

    await expect(caller.getById({ id: PAYMENT_B })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("internal users with no derivable safe scope are forbidden in list", async () => {
    const caller = createCaller({
      permissions: [P.payments.read],
      linkedOutletId: null,
      managedWarehouseId: null,
      payments,
      outletWarehouseById,
      actorOrgId: "99999999-9999-4999-8999-999999999999",
    });

    await expect(caller.list({ limit: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
