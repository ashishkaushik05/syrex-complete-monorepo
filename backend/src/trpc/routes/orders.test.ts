import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { ordersRouter } from "./orders";
import {
  ACTOR_ID,
  dec,
  decEq,
  makeCtx,
  ORDER_A,
  OUTLET_A,
  PRODUCT_A,
  WAREHOUSE_A,
  WAREHOUSE_B,
} from "./__testkit__";

// ASVF coverage for the orders router — every endpoint gets Auth, happy-path (Scope),
// Validation, and Failure tests. orders is core money: create totals + the transition
// state machine + auto-invoice on approve.

// ---------------------------------------------------------------------------
// Prisma mock builder for the orders router
// ---------------------------------------------------------------------------

type OrdersMockOpts = {
  outlet?: Record<string, unknown> | null;
  warehouse?: Record<string, unknown> | null;
  products?: Array<{ id: string; sku: string }>;
  activeCharges?: Array<Record<string, unknown>>;
  // for transition / getById
  order?: Record<string, unknown> | null;
};

function ordersPrisma(opts: OrdersMockOpts = {}) {
  const captured: { create?: Record<string, unknown>; update?: Record<string, unknown> } = {};

  const txClient = {
    orderSequence: {
      upsert: async () => ({ lastSequence: 1 }),
      update: async () => undefined,
    },
    saleOrder: {
      findUnique: async (args: { where: { orderNumber?: string; id?: string } }) => {
        if (args.where.orderNumber !== undefined) return null; // sequence uniqueness probe
        return opts.order ?? null;
      },
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return buildOrderRow(args.data);
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return { ...(opts.order ?? {}), ...args.data, lines: (opts.order?.lines as unknown[]) ?? [] };
      },
    },
    taxCharge: {
      findMany: async () => opts.activeCharges ?? [],
    },
    invoice: {
      findUnique: async (a: { where: { invoiceNumber?: string } }) => (a.where.invoiceNumber !== undefined ? null : null),
      findFirst: async () => null,
      create: async () => ({ id: "inv" }),
      aggregate: async () => ({ _sum: { amountDue: dec(0) } }),
    },
    invoiceSequence: { upsert: async () => ({ lastSequence: 1 }), update: async () => undefined },
    outlet: { findUnique: async () => null, update: async () => ({}) },
    // Ledger models exercised by the posting engine on auto-invoice.
    journalEntry: {
      findFirst: async () => null,
      create: async () => ({ id: "je-1" }),
      findUniqueOrThrow: async () => ({ entryNumber: "JE-2026-000001" }),
    },
    ledgerAccount: {
      findMany: async (a: { where: { code: { in: string[] } } }) =>
        a.where.code.in.map((code) => ({ id: `acc-${code}`, code })),
    },
    journalSequence: { upsert: async () => ({ lastSequence: 1 }) },
  };

  const prisma = {
    outlet: {
      findFirst: async () => null, // assertOutletAccess scoped lookup; super-admin passes anyway
      findUnique: async () => opts.outlet ?? null,
    },
    warehouse: {
      findUnique: async () => opts.warehouse ?? null,
    },
    product: {
      findMany: async () => opts.products ?? [],
    },
    saleOrder: {
      findUnique: async () => opts.order ?? null,
    },
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
  };

  return { prisma, captured };
}

function buildOrderRow(data: Record<string, unknown>) {
  const lines = ((data.lines as { create?: unknown[] })?.create ?? []) as Array<Record<string, unknown>>;
  return {
    id: ORDER_A,
    orderNumber: data.orderNumber ?? "SO-2026-000001",
    outletId: data.outletId,
    orderType: data.orderType ?? "standard",
    sourceComplaintId: null,
    sourceWarehouseId: null,
    suppressAutoInvoice: false,
    serviceMetadata: null,
    createdById: data.createdById ?? ACTOR_ID,
    orderDate: data.orderDate ?? new Date("2026-05-01T00:00:00.000Z"),
    deliveryAddress: data.deliveryAddress ?? "addr",
    status: data.status ?? "pending_approval",
    priority: data.priority ?? "medium",
    subtotalValue: data.subtotalValue ?? dec(0),
    discountType: data.discountType ?? null,
    discountRate: data.discountRate ?? dec(0),
    discountAmount: data.discountAmount ?? dec(0),
    taxableValue: data.taxableValue ?? dec(0),
    taxSnapshot: data.taxSnapshot ?? null,
    taxTotal: data.taxTotal ?? dec(0),
    paymentTermsDays: data.paymentTermsDays ?? 30,
    totalValue: data.totalValue ?? dec(0),
    approvedById: null,
    approvedAt: null,
    heldById: null,
    heldAt: null,
    holdNote: null,
    approvalNote: null,
    rejectionReason: null,
    notes: data.notes ?? null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    lines: lines.map((l, i) => ({
      id: `line-${i}`,
      productId: l.productId,
      sku: l.sku,
      qtyOrdered: l.qtyOrdered,
      qtyDispatched: l.qtyDispatched ?? 0,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}

const ADMIN = { permissions: ["*"], userType: "internal" };
const GST = { id: "tc-1", name: "GST", type: "percentage", rate: dec(18), displayOrder: 1 };

function activeOutlet() {
  return { id: OUTLET_A, isActive: true, warehouseId: WAREHOUSE_A };
}
function activeWarehouse() {
  return { id: WAREHOUSE_A, isActive: true };
}

// ---------------------------------------------------------------------------
// list — Auth + Scope + Failure
// ---------------------------------------------------------------------------

describe("orders.list", () => {
  it("rejects an actor without orders:read (Auth)", async () => {
    const { prisma } = ordersPrisma();
    const caller = ordersRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.list({ limit: 20 })).rejects.toThrow(/Requires|FORBIDDEN|permission/i);
  });

  it("allows a reader and returns a page", async () => {
    const { prisma } = ordersPrisma();
    (prisma.saleOrder as Record<string, unknown>).findMany = async () => [];
    const caller = ordersRouter.createCaller(makeCtx({ permissions: ["orders:read"], prisma }));
    const out = await caller.list({ limit: 20 });
    expect(out.items).toEqual([]);
    expect(out.nextCursor).toBeNull();
  });

  it("rejects mineOnly for a reader lacking orders:write (Failure)", async () => {
    const { prisma } = ordersPrisma();
    const caller = ordersRouter.createCaller(makeCtx({ permissions: ["orders:read"], prisma }));
    await expect(caller.list({ limit: 20, mineOnly: true })).rejects.toThrow(/order-write|FORBIDDEN/i);
  });

  it("permits mineOnly for an order writer", async () => {
    const { prisma } = ordersPrisma();
    (prisma.saleOrder as Record<string, unknown>).findMany = async () => [];
    const caller = ordersRouter.createCaller(
      makeCtx({ permissions: ["orders:read", "orders:write"], prisma }),
    );
    await expect(caller.list({ limit: 20, mineOnly: true })).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getById — Scope + Failure
// ---------------------------------------------------------------------------

describe("orders.getById", () => {
  it("rejects without orders:read (Auth)", async () => {
    const { prisma } = ordersPrisma({ order: null });
    const caller = ordersRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.getById({ id: ORDER_A })).rejects.toThrow(/Requires|FORBIDDEN|permission/i);
  });

  it("throws NOT_FOUND for a missing order (Failure)", async () => {
    const { prisma } = ordersPrisma({ order: null });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.getById({ id: ORDER_A })).rejects.toThrow(/not found/i);
  });

  it("confines a warehouse manager to their warehouse (Scope)", async () => {
    const order = orderRecord("approved", OUTLET_A);
    const { prisma } = ordersPrisma({ order });
    // getById → assertOutletWarehouseScope reads outlet.warehouseId
    (prisma.outlet as Record<string, unknown>).findUnique = async () => ({ warehouseId: WAREHOUSE_B });
    const caller = ordersRouter.createCaller(
      makeCtx({ permissions: ["orders:read"], managedWarehouseId: WAREHOUSE_A, prisma }),
    );
    await expect(caller.getById({ id: ORDER_A })).rejects.toThrow(/scope|FORBIDDEN/i);
  });
});

// ---------------------------------------------------------------------------
// create — Validation + Scope + happy path totals
// ---------------------------------------------------------------------------

const validLine = { productId: PRODUCT_A, qtyOrdered: 2, unitPrice: "500" };

function createInput(over: Record<string, unknown> = {}) {
  return {
    outletId: OUTLET_A,
    deliveryAddress: "1 Test St",
    lines: [validLine],
    ...over,
  };
}

describe("orders.create validation", () => {
  it("rejects without orders:write (Auth)", async () => {
    const { prisma } = ordersPrisma();
    const caller = ordersRouter.createCaller(makeCtx({ permissions: ["orders:read"], prisma }));
    await expect(caller.create(createInput())).rejects.toThrow(/Requires|FORBIDDEN|permission/i);
  });

  it("rejects an empty lines array (Validation)", async () => {
    const { prisma } = ordersPrisma();
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput({ lines: [] }))).rejects.toThrow();
  });

  it("rejects a non-uuid outletId (Validation)", async () => {
    const { prisma } = ordersPrisma();
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput({ outletId: "nope" }))).rejects.toThrow();
  });

  it("rejects an unknown outlet (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: null });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput())).rejects.toThrow(/Invalid outletId/i);
  });

  it("rejects an inactive outlet (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: { ...activeOutlet(), isActive: false } });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput())).rejects.toThrow(/inactive/i);
  });

  it("rejects an outlet with no warehouse (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: { ...activeOutlet(), warehouseId: null } });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput())).rejects.toThrow(/no assigned warehouse/i);
  });

  it("rejects when the assigned warehouse is inactive (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: activeOutlet(), warehouse: { ...activeWarehouse(), isActive: false } });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput())).rejects.toThrow(/warehouse is inactive/i);
  });

  it("rejects when a productId is unknown (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: activeOutlet(), warehouse: activeWarehouse(), products: [] });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.create(createInput())).rejects.toThrow(/invalid/i);
  });

  it("rejects a negative discount rate (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: activeOutlet(), warehouse: activeWarehouse(), products: [{ id: PRODUCT_A, sku: "S1" }] });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(
      caller.create(createInput({ discountType: "fixed", discountRate: "-1" })),
    ).rejects.toThrow(/non-negative/i);
  });

  it("rejects a percentage discount over 100 (Failure)", async () => {
    const { prisma } = ordersPrisma({ outlet: activeOutlet(), warehouse: activeWarehouse(), products: [{ id: PRODUCT_A, sku: "S1" }] });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(
      caller.create(createInput({ discountType: "percentage", discountRate: "150" })),
    ).rejects.toThrow(/exceed 100/i);
  });
});

describe("orders.create happy path", () => {
  it("computes subtotal, tax and grand total and persists pending_approval", async () => {
    const { prisma, captured } = ordersPrisma({
      outlet: activeOutlet(),
      warehouse: activeWarehouse(),
      products: [{ id: PRODUCT_A, sku: "SKU-1" }],
      activeCharges: [GST],
    });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    const out = await caller.create(createInput());

    expect(decEq(captured.create!.subtotalValue as Prisma.Decimal, "1000")).toBe(true);
    expect(decEq(captured.create!.taxTotal as Prisma.Decimal, "180")).toBe(true);
    expect(decEq(captured.create!.totalValue as Prisma.Decimal, "1180")).toBe(true);
    expect(captured.create!.status).toBe("pending_approval");
    expect(captured.create!.createdById).toBe(ACTOR_ID);
    expect(out.lines[0].sku).toBe("SKU-1");
  });

  it("applies a percentage discount before tax", async () => {
    const { prisma, captured } = ordersPrisma({
      outlet: activeOutlet(),
      warehouse: activeWarehouse(),
      products: [{ id: PRODUCT_A, sku: "SKU-1" }],
      activeCharges: [GST],
    });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await caller.create(createInput({ discountType: "percentage", discountRate: "10" }));
    // 1000 - 100 = 900 taxable, +18% = 1062
    expect(decEq(captured.create!.discountAmount as Prisma.Decimal, "100")).toBe(true);
    expect(decEq(captured.create!.taxableValue as Prisma.Decimal, "900")).toBe(true);
    expect(decEq(captured.create!.totalValue as Prisma.Decimal, "1062")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// transition — Auth + state machine + auto-invoice
// ---------------------------------------------------------------------------

function orderRecord(status: string, outletId = OUTLET_A) {
  return {
    id: ORDER_A,
    orderNumber: "SO-2026-000001",
    outletId,
    orderType: "standard",
    sourceComplaintId: null,
    sourceWarehouseId: null,
    suppressAutoInvoice: false,
    serviceMetadata: null,
    createdById: ACTOR_ID,
    orderDate: new Date("2026-05-01T00:00:00.000Z"),
    deliveryAddress: "1 Test St",
    status,
    priority: "medium" as const,
    totalValue: dec("1180"),
    subtotalValue: dec("1000"),
    discountType: null,
    discountRate: dec(0),
    discountAmount: dec(0),
    taxableValue: dec("1000"),
    taxSnapshot: null,
    taxTotal: dec("180"),
    paymentTermsDays: 30,
    approvedById: null,
    approvedAt: null,
    heldById: null,
    heldAt: null,
    holdNote: null,
    approvalNote: null,
    rejectionReason: null,
    notes: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    lines: [
      { id: "l0", productId: PRODUCT_A, sku: "SKU-1", qtyOrdered: 1, qtyDispatched: 0, unitPrice: dec("1000"), lineTotal: dec("1000"), dispatchLines: [] },
    ],
  };
}

describe("orders.transition", () => {
  it("requires orders:manage (Auth)", async () => {
    const { prisma } = ordersPrisma({ order: orderRecord("pending_approval") });
    const caller = ordersRouter.createCaller(makeCtx({ permissions: ["orders:read", "orders:write"], prisma }));
    await expect(caller.transition({ id: ORDER_A, action: "hold" })).rejects.toThrow(/Requires|FORBIDDEN|permission/i);
  });

  it("requires orders:approve specifically for approve (Failure)", async () => {
    const { prisma } = ordersPrisma({ order: orderRecord("pending_approval") });
    const caller = ordersRouter.createCaller(makeCtx({ permissions: ["orders:manage"], prisma }));
    await expect(caller.transition({ id: ORDER_A, action: "approve" })).rejects.toThrow(/orders:approve/i);
  });

  it("throws NOT_FOUND for a missing order (Failure)", async () => {
    const { prisma } = ordersPrisma({ order: null });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.transition({ id: ORDER_A, action: "hold" })).rejects.toThrow(/not found/i);
  });

  it("approves a pending order and writes approval fields", async () => {
    const { prisma, captured } = ordersPrisma({ order: orderRecord("pending_approval"), activeCharges: [] });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    const out = await caller.transition({ id: ORDER_A, action: "approve", note: "ok" });
    expect(captured.update!.status).toBe("approved");
    expect(captured.update!.approvedById).toBe(ACTOR_ID);
    expect(out.status).toBe("approved");
  });

  it("rejects approving an already-approved order (state machine)", async () => {
    const { prisma } = ordersPrisma({ order: orderRecord("approved") });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.transition({ id: ORDER_A, action: "approve" })).rejects.toThrow(/pending_approval or on_hold/i);
  });

  it("only holds a pending_approval order", async () => {
    const { prisma } = ordersPrisma({ order: orderRecord("approved") });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.transition({ id: ORDER_A, action: "hold" })).rejects.toThrow(/pending_approval orders/i);
  });

  it("cannot cancel a fully_dispatched order (state machine)", async () => {
    const { prisma } = ordersPrisma({ order: orderRecord("fully_dispatched") });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await expect(caller.transition({ id: ORDER_A, action: "cancel" })).rejects.toThrow(/cannot be cancelled/i);
  });

  it("cancels an on_hold order", async () => {
    const { prisma, captured } = ordersPrisma({ order: orderRecord("on_hold") });
    const caller = ordersRouter.createCaller(makeCtx({ ...ADMIN, prisma }));
    await caller.transition({ id: ORDER_A, action: "cancel", note: "stop" });
    expect(captured.update!.status).toBe("cancelled");
  });
});
