import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { accountsRouter } from "./accounts";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTLET_A = "11111111-1111-4111-8111-111111111111";
const OUTLET_B = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_A = "33333333-3333-4333-8333-333333333333";

function createCaller(opts: {
  permissions: string[];
  linkedOutletId: string | null;
  managedWarehouseId: string | null;
}) {
  const outlets = [
    { id: OUTLET_A, outletCode: "OUT-A", name: "Alpha Outlet", warehouseId: WAREHOUSE_A },
    { id: OUTLET_B, outletCode: "OUT-B", name: "Beta Outlet", warehouseId: null },
  ];
  const invoices = [
    {
      id: "invoice-before",
      outletId: OUTLET_A,
      invoiceNumber: "INV-BEFORE",
      invoiceDate: new Date("2026-04-25T00:00:00.000Z"),
      dueDate: null,
      total: new Prisma.Decimal(1000),
    },
    {
      id: "invoice-in-range",
      outletId: OUTLET_A,
      invoiceNumber: "INV-MAY",
      invoiceDate: new Date("2026-05-10T00:00:00.000Z"),
      dueDate: new Date("2026-06-09T00:00:00.000Z"),
      total: new Prisma.Decimal(500),
    },
  ];
  const payments = [
    {
      id: "payment-before",
      outletId: OUTLET_A,
      amount: new Prisma.Decimal(200),
      paymentDate: new Date("2026-04-28T00:00:00.000Z"),
      reference: "PAY-BEFORE",
      description: null,
    },
    {
      id: "payment-in-range",
      outletId: OUTLET_A,
      amount: new Prisma.Decimal(300),
      paymentDate: new Date("2026-05-15T00:00:00.000Z"),
      reference: "PAY-MAY",
      description: "Bank transfer",
    },
  ];
  const reversals = [
    {
      id: "reversal-in-range",
      outletId: OUTLET_A,
      paymentId: "payment-in-range",
      amount: new Prisma.Decimal(300),
      reason: "Wrong outlet",
      reversedAt: new Date("2026-05-16T00:00:00.000Z"),
    },
  ];

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
        const outlet = outlets.find((row) => row.id === args.where?.id) ?? null;
        if (!outlet) return null;
        if (args.select?.warehouseId) {
          return { warehouseId: outlet.warehouseId };
        }
        if (args.select) {
          return { id: outlet.id, outletCode: outlet.outletCode, name: outlet.name };
        }
        return outlet;
      },
      findFirst: async (args: any) => {
        return outlets.find((row) => row.id === args.where?.id && row.warehouseId === args.where?.warehouseId) ?? null;
      },
    },
    invoice: {
      findMany: async (args: any) =>
        invoices.filter((row) => row.outletId === args.where.outletId && row.invoiceDate <= args.where.invoiceDate.lte),
    },
    outletPayment: {
      findMany: async (args: any) =>
        payments.filter((row) => row.outletId === args.where.outletId && row.paymentDate <= args.where.paymentDate.lte),
    },
    outletPaymentReversal: {
      findMany: async (args: any) =>
        reversals.filter((row) => row.outletId === args.where.outletId && row.reversedAt <= args.where.reversedAt.lte),
    },
  };

  return accountsRouter.createCaller({
    requestId: "test",
    actor: { id: ACTOR_ID, orgId: null, sessionId: null },
    prisma: prisma as any,
    permissions: opts.permissions,
    managedWarehouseId: opts.managedWarehouseId,
    linkedOutletId: opts.linkedOutletId,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "203.0.113.10",
  } as any);
}

describe("accounts statement", () => {
  it("builds opening balance, running balance, and reversal rows", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read, P.payments.read],
      linkedOutletId: null,
      managedWarehouseId: WAREHOUSE_A,
    });

    const result = await caller.statement({
      outletId: OUTLET_A,
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-31T23:59:59.999Z",
    });

    expect(result.openingBalance).toBe("800.00");
    expect(result.totalInvoiced).toBe("500.00");
    expect(result.totalReceived).toBe("300.00");
    expect(result.totalReversed).toBe("300.00");
    expect(result.closingBalance).toBe("1300.00");
    expect(result.rows.map((row) => row.kind)).toEqual(["invoice", "payment", "payment_reversal"]);
    expect(result.rows.map((row) => row.runningBalance)).toEqual(["1300.00", "1000.00", "1300.00"]);
  });

  it("forbids outlet-linked users from another outlet statement", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read, P.payments.read],
      linkedOutletId: OUTLET_B,
      managedWarehouseId: null,
    });

    await expect(caller.statement({
      outletId: OUTLET_A,
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-31T23:59:59.999Z",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
