import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { invoicesRouter } from "./invoices";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  orderId: string;
  outletId: string;
  invoiceDate: Date;
  dueDate: Date | null;
  subtotal: Prisma.Decimal;
  discountType: "percentage" | "fixed" | null;
  discountRate: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  createdAt: Date;
  lines: Array<{
    id: string;
    productId: string;
    sku: string;
    qty: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
  charges: Array<{
    id: string;
    taxChargeId: string | null;
    name: string;
    type: "percentage" | "fixed";
    rate: Prisma.Decimal;
    amount: Prisma.Decimal;
    displayOrder: number;
  }>;
};

type OrderRow = {
  id: string;
  outletId: string;
  orderNumber: string;
};

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTLET_A = "11111111-1111-4111-8111-111111111111";
const OUTLET_B = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE_A = "33333333-3333-4333-8333-333333333333";
const WAREHOUSE_B = "44444444-4444-4444-8444-444444444444";
const ORDER_A = "55555555-5555-4555-8555-555555555555";
const ORDER_B = "66666666-6666-4666-8666-666666666666";
const INVOICE_A = "77777777-7777-4777-8777-777777777777";
const INVOICE_B = "88888888-8888-4888-8888-888888888888";

function makeInvoice(id: string, orderId: string, outletId: string, invoiceNumber: string): InvoiceRow {
  return {
    id,
    invoiceNumber,
    orderId,
    outletId,
    invoiceDate: new Date("2026-05-20T10:00:00.000Z"),
    dueDate: new Date("2026-05-25T10:00:00.000Z"),
    subtotal: new Prisma.Decimal(1000),
    discountType: null,
    discountRate: new Prisma.Decimal(0),
    discountAmount: new Prisma.Decimal(0),
    total: new Prisma.Decimal(1000),
    amountPaid: new Prisma.Decimal(100),
    amountDue: new Prisma.Decimal(900),
    createdAt: new Date("2026-05-20T10:00:00.000Z"),
    lines: [
      {
        id: `line-${id}`,
        productId: "99999999-9999-4999-8999-999999999999",
        sku: `SKU-${id.slice(0, 4)}`,
        qty: 1,
        unitPrice: new Prisma.Decimal(1000),
        lineTotal: new Prisma.Decimal(1000),
      },
    ],
    charges: [],
  };
}

function matchesContains(value: string, needle: string) {
  return value.toLowerCase().includes(needle.toLowerCase());
}

function matchesWhere(
  invoice: InvoiceRow,
  where: any,
  outletWarehouseById: Record<string, string | null>,
  ordersById: Record<string, OrderRow>,
): boolean {
  if (!where) return true;
  if (where.AND && Array.isArray(where.AND)) {
    return where.AND.every((clause: any) => matchesWhere(invoice, clause, outletWarehouseById, ordersById));
  }
  if (where.OR && Array.isArray(where.OR)) {
    return where.OR.some((clause: any) => matchesWhere(invoice, clause, outletWarehouseById, ordersById));
  }
  if (where.id && invoice.id !== where.id) return false;
  if (where.outletId && invoice.outletId !== where.outletId) return false;
  if (where.orderId && invoice.orderId !== where.orderId) return false;
  if (where.invoiceNumber?.contains && !matchesContains(invoice.invoiceNumber, where.invoiceNumber.contains)) {
    return false;
  }
  if (where.order?.orderNumber?.contains) {
    const orderNumber = ordersById[invoice.orderId]?.orderNumber ?? "";
    if (!matchesContains(orderNumber, where.order.orderNumber.contains)) return false;
  }
  if (where.outlet?.warehouseId) {
    const warehouseId = outletWarehouseById[invoice.outletId] ?? null;
    if (warehouseId !== where.outlet.warehouseId) return false;
  }
  return true;
}

function createCaller(opts: {
  permissions: string[];
  linkedOutletId: string | null;
  managedWarehouseId: string | null;
  invoices: InvoiceRow[];
  orders: OrderRow[];
  outletWarehouseById: Record<string, string | null>;
  actorOrgId?: string | null;
}) {
  const ordersById = Object.fromEntries(opts.orders.map((o) => [o.id, o]));

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
    saleOrder: {
      findFirst: async (args: any) => {
        return (
          opts.orders.find(
            (order) => order.id === args.where?.id && order.outletId === args.where?.outletId,
          ) ?? null
        );
      },
    },
    invoice: {
      findMany: async (args: any) => {
        const filtered = opts.invoices.filter((invoice) =>
          matchesWhere(invoice, args.where, opts.outletWarehouseById, ordersById),
        );
        const start = args.skip ?? 0;
        const end = start + (args.take ?? filtered.length);
        return filtered.slice(start, end);
      },
      findFirst: async (args: any) => {
        return (
          opts.invoices.find((invoice) =>
            matchesWhere(invoice, args.where, opts.outletWarehouseById, ordersById),
          ) ?? null
        );
      },
    },
  };

  return invoicesRouter.createCaller({
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

describe("invoices route scoping", () => {
  const invoices = [
    makeInvoice(INVOICE_A, ORDER_A, OUTLET_A, "INV-A"),
    makeInvoice(INVOICE_B, ORDER_B, OUTLET_B, "INV-B"),
  ];
  const orders: OrderRow[] = [
    { id: ORDER_A, outletId: OUTLET_A, orderNumber: "SO-A" },
    { id: ORDER_B, outletId: OUTLET_B, orderNumber: "SO-B" },
  ];
  const outletWarehouseById = {
    [OUTLET_A]: WAREHOUSE_A,
    [OUTLET_B]: WAREHOUSE_B,
  };

  it("warehouse managers only list invoices for their managed warehouse", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read],
      linkedOutletId: null,
      managedWarehouseId: WAREHOUSE_A,
      invoices,
      orders,
      outletWarehouseById,
    });

    const result = await caller.list({ limit: 25 });
    expect(result.items.map((item) => item.id)).toEqual([INVOICE_A]);
  });

  it("outlet-linked users only list invoices for their outlet", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read],
      linkedOutletId: OUTLET_B,
      managedWarehouseId: null,
      invoices,
      orders,
      outletWarehouseById,
    });

    const result = await caller.list({ limit: 25 });
    expect(result.items.map((item) => item.id)).toEqual([INVOICE_B]);
  });

  it("internal users with no derivable safe scope are forbidden in list", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read],
      linkedOutletId: null,
      managedWarehouseId: null,
      invoices,
      orders,
      outletWarehouseById,
      actorOrgId: "99999999-9999-4999-8999-999999999999",
    });

    await expect(caller.list({ limit: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("list returns NOT_FOUND for outletId/orderId mismatch to prevent probing", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read],
      linkedOutletId: null,
      managedWarehouseId: WAREHOUSE_A,
      invoices,
      orders,
      outletWarehouseById,
    });

    await expect(
      caller.list({ limit: 25, outletId: OUTLET_A, orderId: ORDER_B }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("getById returns NOT_FOUND for linked outlet user outside own outlet scope", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read],
      linkedOutletId: OUTLET_A,
      managedWarehouseId: null,
      invoices,
      orders,
      outletWarehouseById,
    });

    await expect(caller.getById({ id: INVOICE_B })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("arAging is scoped to linked outlet users", async () => {
    const caller = createCaller({
      permissions: [P.invoices.read],
      linkedOutletId: OUTLET_B,
      managedWarehouseId: null,
      invoices,
      orders,
      outletWarehouseById,
    });

    const result = await caller.arAging({ limit: 25 });
    expect(result.items.map((item) => item.outletId)).toEqual([OUTLET_B]);
    expect(result.summary.totalOutstanding).toBe("900");
  });
});
