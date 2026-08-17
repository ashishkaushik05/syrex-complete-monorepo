import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { invoicesRouter } from "./invoices";
import {
  ACTOR_ID,
  INVOICE_A,
  INVOICE_B,
  makeCtx,
  ORDER_A,
  ORDER_B,
  OUTLET_A,
  OUTLET_B,
  WAREHOUSE_A,
  WAREHOUSE_B,
} from "./__testkit__";

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
  if (where.amountDue?.gt !== undefined && !invoice.amountDue.gt(where.amountDue.gt)) {
    return false;
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
  taxCharges?: Array<{ id: string; name: string; type: "percentage" | "fixed"; rate: Prisma.Decimal; displayOrder: number }>;
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
    taxCharge: {
      findMany: async () => opts.taxCharges ?? [],
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

  return invoicesRouter.createCaller(
    makeCtx({
      actorId: ACTOR_ID,
      actorOrgId: opts.actorOrgId ?? null,
      prisma,
      permissions: opts.permissions,
      managedWarehouseId: opts.managedWarehouseId,
      linkedOutletId: opts.linkedOutletId,
    }),
  );
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

// ── Phase 3 ASVF hardening (DEC-20260613-010) ────────────────────────────────

const ADMIN = ["*"];

function emptyOpts(permissions: string[]) {
  return {
    permissions,
    linkedOutletId: null,
    managedWarehouseId: null,
    invoices: [] as InvoiceRow[],
    orders: [] as OrderRow[],
    outletWarehouseById: {} as Record<string, string | null>,
  };
}

describe("invoices auth gates (DEC-20260613-010)", () => {
  it("list requires invoices:read", async () => {
    await expect(createCaller(emptyOpts([])).list({ limit: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("getById requires invoices:read", async () => {
    await expect(createCaller(emptyOpts([])).getById({ id: INVOICE_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("previewCharges requires invoices:read", async () => {
    await expect(createCaller(emptyOpts([])).previewCharges({ subtotal: "100" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("arAging requires invoices:read", async () => {
    await expect(createCaller(emptyOpts([])).arAging({ limit: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("updateCharges requires invoices:write", async () => {
    await expect(
      createCaller(emptyOpts([P.invoices.read])).updateCharges({ invoiceId: INVOICE_A, charges: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("update requires invoices:write", async () => {
    await expect(
      createCaller(emptyOpts([P.invoices.read])).update({ invoiceId: INVOICE_A }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("invoices.previewCharges math (DEC-20260613-010)", () => {
  const opts = (over: Partial<Parameters<typeof createCaller>[0]> = {}) => ({
    ...emptyOpts(ADMIN),
    taxCharges: [
      { id: "tc-gst", name: "GST", type: "percentage" as const, rate: new Prisma.Decimal(18), displayOrder: 0 },
      { id: "tc-fee", name: "Handling", type: "fixed" as const, rate: new Prisma.Decimal(50), displayOrder: 1 },
    ],
    ...over,
  });

  it("applies a percentage discount then percentage + fixed charges (Happy)", async () => {
    const caller = createCaller(opts());
    const out = await caller.previewCharges({ subtotal: "1000", discountType: "percentage", discountRate: "10" });
    // 1000 - 10% = 900 taxable; GST 18% = 162; +50 fixed; total 900+162+50 = 1112.
    expect(out.discountAmount).toBe("100.00");
    expect(out.taxableSubtotal).toBe("900.00");
    const gst = out.charges.find((c) => c.name === "GST");
    expect(gst?.amount).toBe("162.00");
    expect(out.charges.find((c) => c.name === "Handling")?.amount).toBe("50.00");
    expect(out.total).toBe("1112.00");
  });

  it("caps a fixed discount at the subtotal (edge)", async () => {
    const caller = createCaller({ ...emptyOpts(ADMIN), taxCharges: [] });
    const out = await caller.previewCharges({ subtotal: "100", discountType: "fixed", discountRate: "250" });
    expect(out.discountAmount).toBe("100.00");
    expect(out.taxableSubtotal).toBe("0.00");
    expect(out.total).toBe("0.00");
  });

  it("rejects a negative discount rate (Validation)", async () => {
    await expect(
      createCaller(opts()).previewCharges({ subtotal: "1000", discountType: "fixed", discountRate: "-1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a percentage discount over 100 (Validation)", async () => {
    await expect(
      createCaller(opts()).previewCharges({ subtotal: "1000", discountType: "percentage", discountRate: "150" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("invoices.arAging bucket classification (DEC-20260613-010)", () => {
  const asOf = "2026-07-01T00:00:00.000Z";

  function aged(id: string, dueDate: string | null, amountDue: number): InvoiceRow {
    const inv = makeInvoice(id, ORDER_A, OUTLET_A, `INV-${id.slice(0, 4)}`);
    inv.dueDate = dueDate ? new Date(dueDate) : null;
    inv.amountDue = new Prisma.Decimal(amountDue);
    return inv;
  }

  it("classifies open invoices into the five aging buckets and totals them (Happy)", async () => {
    const invoices = [
      aged("c0000000-0000-4000-8000-000000000001", "2026-07-15T00:00:00.000Z", 100), // future → current
      aged("c0000000-0000-4000-8000-000000000002", "2026-06-20T00:00:00.000Z", 100), // 11d → 1_30
      aged("c0000000-0000-4000-8000-000000000003", "2026-05-15T00:00:00.000Z", 100), // 47d → 31_60
      aged("c0000000-0000-4000-8000-000000000004", "2026-04-15T00:00:00.000Z", 100), // 77d → 61_90
      aged("c0000000-0000-4000-8000-000000000005", "2026-01-01T00:00:00.000Z", 100), // 181d → 90_plus
    ];
    const caller = createCaller({ ...emptyOpts(ADMIN), invoices });
    const out = await caller.arAging({ limit: 100, asOf });

    expect(out.summary).toMatchObject({
      current: "100",
      bucket1_30: "100",
      bucket31_60: "100",
      bucket61_90: "100",
      bucket90Plus: "100",
      totalOutstanding: "500",
    });
    const byId = Object.fromEntries(out.items.map((i) => [i.id, i.agingBucket]));
    expect(byId["c0000000-0000-4000-8000-000000000001"]).toBe("current");
    expect(byId["c0000000-0000-4000-8000-000000000005"]).toBe("90_plus");
  });

  it("excludes fully-paid invoices (amountDue 0) from aging (Failure/edge)", async () => {
    const invoices = [
      aged("c0000000-0000-4000-8000-000000000006", "2026-05-15T00:00:00.000Z", 0),
      aged("c0000000-0000-4000-8000-000000000007", "2026-05-15T00:00:00.000Z", 200),
    ];
    const caller = createCaller({ ...emptyOpts(ADMIN), invoices });
    const out = await caller.arAging({ limit: 100, asOf });
    expect(out.items).toHaveLength(1);
    expect(out.summary.totalOutstanding).toBe("200");
  });
});

// Stateful invoice store for the recompute mutations (updateCharges / update).
// Mirrors the DB: charges are deleted+recreated, lines mutate in place, and the
// final findUniqueOrThrow returns the post-write row so the asserted totals come
// from the route's own math.
function makeInvoiceStore(seed: InvoiceRow) {
  const inv: InvoiceRow = {
    ...seed,
    lines: seed.lines.map((l) => ({ ...l })),
    charges: seed.charges.map((c) => ({ ...c })),
  };
  let chargeSeq = 0;

  const present = () => ({
    ...inv,
    lines: inv.lines.map((l) => ({ ...l })),
    charges: [...inv.charges].sort((a, b) => a.displayOrder - b.displayOrder),
  });

  const api: any = {
    invoice: {
      findUnique: async ({ where }: any) => (where.id === inv.id ? present() : null),
      findUniqueOrThrow: async () => present(),
      update: async ({ data }: any) => {
        Object.assign(inv, data);
        return present();
      },
      aggregate: async () => ({ _sum: { amountDue: inv.amountDue } }),
    },
    invoiceLine: {
      update: async ({ where, data }: any) => {
        const line = inv.lines.find((l) => l.id === where.id)!;
        Object.assign(line, data);
        return line;
      },
      findMany: async () => inv.lines.map((l) => ({ ...l })),
    },
    invoiceCharge: {
      deleteMany: async () => {
        inv.charges = [];
        return { count: 0 };
      },
      createMany: async ({ data }: any) => {
        inv.charges = data.map((c: any) => ({ id: `chg-${chargeSeq++}`, ...c }));
        return { count: data.length };
      },
    },
    outlet: { update: async () => ({ id: inv.outletId }) },
    $transaction: async (fn: any) => fn(api),
  };
  return { api, inv };
}

function mutationCaller(store: { api: any }, permissions: string[] = ADMIN) {
  return invoicesRouter.createCaller(
    makeCtx({ actorId: ACTOR_ID, prisma: store.api, permissions, managedWarehouseId: null, linkedOutletId: null }),
  );
}

describe("invoices.updateCharges recompute (DEC-20260613-010)", () => {
  const seed = () => makeInvoice(INVOICE_A, ORDER_A, OUTLET_A, "INV-A"); // subtotal 1000, paid 100, due 900

  it("recomputes total and amountDue after applying a percentage charge (Happy)", async () => {
    const store = makeInvoiceStore(seed());
    const out = await mutationCaller(store).updateCharges({
      invoiceId: INVOICE_A,
      charges: [{ name: "GST", type: "percentage", rate: "18", displayOrder: 0 }],
    });
    // taxable 1000 → GST 180 → total 1180 → due 1180 - 100 paid = 1080.
    expect(out.charges[0].amount).toBe("180");
    expect(out.total).toBe("1180");
    expect(out.amountDue).toBe("1080");
  });

  it("rejects a percentage charge rate over 100 (Validation)", async () => {
    const store = makeInvoiceStore(seed());
    await expect(
      mutationCaller(store).updateCharges({ invoiceId: INVOICE_A, charges: [{ name: "Bad", type: "percentage", rate: "150", displayOrder: 0 }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns NOT_FOUND for an unknown invoice (Failure)", async () => {
    const store = makeInvoiceStore(seed());
    await expect(
      mutationCaller(store).updateCharges({ invoiceId: INVOICE_B, charges: [] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("invoices.update recompute (DEC-20260613-010)", () => {
  const LINE_ID = "a1000000-0000-4000-8000-0000000000a1";
  const seed = () => {
    const inv = makeInvoice(INVOICE_A, ORDER_A, OUTLET_A, "INV-A");
    inv.lines[0].id = LINE_ID; // update input requires a uuid line id
    return inv;
  };

  it("recomputes subtotal/total/amountDue from edited lines (Happy)", async () => {
    const store = makeInvoiceStore(seed());
    const lineId = store.inv.lines[0].id;
    const out = await mutationCaller(store).update({
      invoiceId: INVOICE_A,
      lines: [{ id: lineId, qty: 2, unitPrice: "1000" }],
    });
    // line 2 × 1000 = 2000 subtotal; no discount/charges; total 2000; due 2000 - 100 = 1900.
    expect(out.subtotal).toBe("2000");
    expect(out.total).toBe("2000");
    expect(out.amountDue).toBe("1900");
  });

  it("rejects a line id that does not belong to the invoice (Validation)", async () => {
    const store = makeInvoiceStore(seed());
    await expect(
      mutationCaller(store).update({
        invoiceId: INVOICE_A,
        lines: [{ id: "f0000000-0000-4000-8000-0000000000ff", qty: 1, unitPrice: "10" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invoice line does not belong to invoice" });
  });

  it("rejects a negative unit price (Validation)", async () => {
    const store = makeInvoiceStore(seed());
    const lineId = store.inv.lines[0].id;
    await expect(
      mutationCaller(store).update({ invoiceId: INVOICE_A, lines: [{ id: lineId, qty: 1, unitPrice: "-5" }] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a discount percentage over 100 (Validation)", async () => {
    const store = makeInvoiceStore(seed());
    await expect(
      mutationCaller(store).update({ invoiceId: INVOICE_A, discountType: "percentage", discountRate: "150" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns NOT_FOUND for an unknown invoice (Failure)", async () => {
    const store = makeInvoiceStore(seed());
    await expect(
      mutationCaller(store).update({ invoiceId: INVOICE_B }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
