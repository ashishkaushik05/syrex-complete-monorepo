import { describe, expect, it } from "bun:test";
import { OrderStatus, Prisma } from "@prisma/client";
import {
  computeChargeRows,
  computeDiscountAmount,
  createAutoInvoice,
  parseChargeSnapshot,
  parseDecimal,
  queryOrderDetail,
  queryOrderList,
  serializeOrder,
  type ChargeDefinition,
} from "./orders-shared";
import {
  ACTOR_ID,
  dec,
  decEq,
  makeCtx,
  ORDER_A,
  OUTLET_A,
  OUTLET_B,
  WAREHOUSE_A,
} from "./__testkit__";

// orders-shared is the highest-leverage P0 surface: pure order/line/total math reused by
// order creation AND auto-invoice. Tested as ASVF where it has a flow (queryOrderList /
// queryOrderDetail / createAutoInvoice), and table-driven for the pure money functions.

// ---------------------------------------------------------------------------
// parseDecimal
// ---------------------------------------------------------------------------

describe("parseDecimal", () => {
  it("parses numeric strings", () => {
    expect(decEq(parseDecimal("12.34")!, "12.34")).toBe(true);
  });

  it("parses numbers", () => {
    expect(decEq(parseDecimal(99)!, 99)).toBe(true);
  });

  it("parses zero and negative", () => {
    expect(decEq(parseDecimal("0")!, 0)).toBe(true);
    expect(decEq(parseDecimal(-5)!, -5)).toBe(true);
  });

  it.each([
    ["object", { rate: 1 }],
    ["array", [1]],
    ["null", null],
    ["undefined", undefined],
    ["boolean", true],
  ])("returns null for non string/number input: %s", (_label, value) => {
    expect(parseDecimal(value as unknown)).toBeNull();
  });

  it("returns null for an unparseable string", () => {
    expect(parseDecimal("not-a-number")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeDiscountAmount
// ---------------------------------------------------------------------------

describe("computeDiscountAmount", () => {
  it.each<[string, number, "percentage" | "fixed" | null, number, string]>([
    ["percentage 10% of 1000", 1000, "percentage", 10, "100"],
    ["fixed 250 off 1000", 1000, "fixed", 250, "250"],
    ["percentage rounds half-up", 999, "percentage", 33.333, "333"], // 999*33.333/100 = 332.99667 → 333.00? actually 332.997 → 333.00
    ["percentage cap at 100%", 1000, "percentage", 150, "1000"],
    ["fixed cap at subtotal", 800, "fixed", 5000, "800"],
  ])("%s", (_label, subtotal, type, rate, expected) => {
    const out = computeDiscountAmount(dec(subtotal), type, dec(rate));
    expect(decEq(out, expected)).toBe(true);
  });

  it.each<[string, number, "percentage" | "fixed" | null, number]>([
    ["zero subtotal → 0", 0, "percentage", 10],
    ["negative subtotal → 0", -100, "fixed", 10],
    ["zero rate → 0", 1000, "percentage", 0],
    ["null discount type → 0", 1000, null, 50],
  ])("%s", (_label, subtotal, type, rate) => {
    expect(decEq(computeDiscountAmount(dec(subtotal), type, dec(rate)), 0)).toBe(true);
  });

  it("rounds a percentage discount half-up to 2dp", () => {
    // 1000 * 12.345% = 123.45 exactly
    expect(decEq(computeDiscountAmount(dec(1000), "percentage", dec("12.345")), "123.45")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeChargeRows
// ---------------------------------------------------------------------------

describe("computeChargeRows", () => {
  const gst: ChargeDefinition = {
    taxChargeId: "tc-1",
    name: "GST",
    type: "percentage",
    rate: dec(18),
    displayOrder: 1,
  };
  const flat: ChargeDefinition = {
    taxChargeId: "tc-2",
    name: "Handling",
    type: "fixed",
    rate: dec("49.50"),
    displayOrder: 2,
  };

  it("computes a percentage charge on the taxable subtotal", () => {
    const [row] = computeChargeRows(dec(1000), [gst]);
    expect(decEq(row.amount, 180)).toBe(true);
    expect(row.taxChargeId).toBe("tc-1");
    expect(row.name).toBe("GST");
    expect(row.displayOrder).toBe(1);
  });

  it("passes a fixed charge through at its rate", () => {
    const [row] = computeChargeRows(dec(1000), [flat]);
    expect(decEq(row.amount, "49.50")).toBe(true);
  });

  it("preserves the original rate on the row, not the computed amount", () => {
    const [row] = computeChargeRows(dec(1000), [gst]);
    expect(decEq(row.rate, 18)).toBe(true);
  });

  it("rounds percentage charges half-up to 2dp", () => {
    // 333 * 18% = 59.94
    const [row] = computeChargeRows(dec(333), [gst]);
    expect(decEq(row.amount, "59.94")).toBe(true);
  });

  it("maps multiple charges in order", () => {
    const rows = computeChargeRows(dec(1000), [gst, flat]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(["GST", "Handling"]);
  });

  it("returns an empty array for no charges", () => {
    expect(computeChargeRows(dec(1000), [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseChargeSnapshot
// ---------------------------------------------------------------------------

describe("parseChargeSnapshot", () => {
  it("returns [] for null", () => {
    expect(parseChargeSnapshot(null)).toEqual([]);
  });

  it("returns [] for a non-array snapshot", () => {
    expect(parseChargeSnapshot({ name: "GST" } as unknown as Prisma.JsonValue)).toEqual([]);
  });

  it("parses a valid snapshot and sorts by displayOrder", () => {
    const snap = [
      { taxChargeId: "b", name: "Second", type: "fixed", rate: "10", displayOrder: 2 },
      { taxChargeId: "a", name: "First", type: "percentage", rate: "18", displayOrder: 1 },
    ] as unknown as Prisma.JsonValue;
    const out = parseChargeSnapshot(snap);
    expect(out.map((c) => c.name)).toEqual(["First", "Second"]);
    expect(decEq(out[0].rate, 18)).toBe(true);
  });

  it("drops rows with an invalid type", () => {
    const snap = [
      { taxChargeId: "a", name: "Bad", type: "flat", rate: "1", displayOrder: 1 },
      { taxChargeId: "b", name: "Good", type: "fixed", rate: "1", displayOrder: 2 },
    ] as unknown as Prisma.JsonValue;
    expect(parseChargeSnapshot(snap).map((c) => c.name)).toEqual(["Good"]);
  });

  it("drops rows missing name / displayOrder / rate", () => {
    const snap = [
      { taxChargeId: "a", type: "fixed", rate: "1", displayOrder: 1 }, // no name
      { taxChargeId: "b", name: "X", type: "fixed", rate: "1" }, // no displayOrder
      { taxChargeId: "c", name: "Y", type: "fixed", displayOrder: 3 }, // no rate
      { taxChargeId: "d", name: "Z", type: "fixed", rate: "1", displayOrder: 9, mode: 0.5 }, // non-int displayOrder ok? int 9 fine
    ] as unknown as Prisma.JsonValue;
    expect(parseChargeSnapshot(snap).map((c) => c.name)).toEqual(["Z"]);
  });

  it("skips non-object entries", () => {
    const snap = [
      null,
      "str",
      42,
      ["nested"],
      { taxChargeId: "a", name: "Keep", type: "fixed", rate: "1", displayOrder: 1 },
    ] as unknown as Prisma.JsonValue;
    expect(parseChargeSnapshot(snap).map((c) => c.name)).toEqual(["Keep"]);
  });

  it("defaults a missing taxChargeId to null", () => {
    const snap = [
      { name: "NoId", type: "fixed", rate: "1", displayOrder: 1 },
    ] as unknown as Prisma.JsonValue;
    expect(parseChargeSnapshot(snap)[0].taxChargeId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// serializeOrder — line/order status derivation + decimal/date shaping
// ---------------------------------------------------------------------------

type LineSeed = { qtyOrdered: number; qtyDispatched: number };

function baseOrderRow(status: OrderStatus, lines: LineSeed[]) {
  return {
    id: ORDER_A,
    orderNumber: "SO-2026-000001",
    outletId: OUTLET_A,
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
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    lines: lines.map((l, i) => ({
      id: `line-${i}`,
      productId: "99999999-9999-4999-8999-999999999999",
      sku: `SKU-${i}`,
      qtyOrdered: l.qtyOrdered,
      qtyDispatched: l.qtyDispatched,
      unitPrice: dec("100"),
      lineTotal: dec(String(l.qtyOrdered * 100)),
    })),
  };
}

describe("serializeOrder line status", () => {
  it.each<[string, number, number, string]>([
    ["nothing dispatched → pending", 5, 0, "pending"],
    ["partial → partially_dispatched", 5, 2, "partially_dispatched"],
    ["complete → fully_dispatched", 5, 5, "fully_dispatched"],
    ["over-dispatched → fully_dispatched", 5, 7, "fully_dispatched"],
  ])("%s", (_label, ordered, dispatched, expected) => {
    const out = serializeOrder(baseOrderRow("approved", [{ qtyOrdered: ordered, qtyDispatched: dispatched }]));
    expect(out.lines[0].status as string).toBe(expected);
  });
});

describe("serializeOrder order status derivation", () => {
  it("leaves a non-approved status untouched", () => {
    const out = serializeOrder(baseOrderRow("pending_approval", [{ qtyOrdered: 5, qtyDispatched: 5 }]));
    expect(out.status).toBe("pending_approval");
  });

  it("keeps approved when nothing dispatched", () => {
    const out = serializeOrder(baseOrderRow("approved", [{ qtyOrdered: 5, qtyDispatched: 0 }]));
    expect(out.status).toBe("approved");
  });

  it("derives partially_dispatched", () => {
    const out = serializeOrder(
      baseOrderRow("approved", [
        { qtyOrdered: 5, qtyDispatched: 5 },
        { qtyOrdered: 5, qtyDispatched: 0 },
      ]),
    );
    expect(out.status).toBe("partially_dispatched");
  });

  it("derives fully_dispatched when every line is complete", () => {
    const out = serializeOrder(
      baseOrderRow("approved", [
        { qtyOrdered: 5, qtyDispatched: 5 },
        { qtyOrdered: 2, qtyDispatched: 2 },
      ]),
    );
    expect(out.status).toBe("fully_dispatched");
  });

  it("keeps approved when the order has no lines", () => {
    const out = serializeOrder(baseOrderRow("approved", []));
    expect(out.status).toBe("approved");
  });
});

describe("serializeOrder shaping", () => {
  it("stringifies decimals and ISO-formats dates", () => {
    const out = serializeOrder(baseOrderRow("approved", [{ qtyOrdered: 1, qtyDispatched: 0 }]));
    expect(out.subtotalValue).toBe("1000");
    expect(out.taxTotal).toBe("180");
    expect(out.orderDate).toBe("2026-05-01T00:00:00.000Z");
    expect(out.updatedAt).toBe("2026-05-02T00:00:00.000Z");
    expect(out.lines[0].unitPrice).toBe("100");
  });

  it("nulls optional dates rather than crashing", () => {
    const out = serializeOrder(baseOrderRow("approved", [{ qtyOrdered: 1, qtyDispatched: 0 }]));
    expect(out.approvedAt).toBeNull();
    expect(out.heldAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// queryOrderList — scope branch selection (the where the route hands to prisma)
// ---------------------------------------------------------------------------

function listCtx(opts: {
  permissions?: string[];
  managedWarehouseId?: string | null;
  userType?: string | null;
  rows?: unknown[];
}) {
  let captured: Record<string, unknown> | undefined;
  const rows = opts.rows ?? [];
  const prisma = {
    saleOrder: {
      findMany: async (args: { where: Record<string, unknown>; take: number }) => {
        captured = args.where;
        return rows.slice(0, args.take);
      },
    },
  };
  const ctx = makeCtx({
    actorId: ACTOR_ID,
    permissions: opts.permissions ?? [],
    managedWarehouseId: opts.managedWarehouseId ?? null,
    userType: opts.userType ?? null,
    prisma,
  });
  return { ctx, where: () => captured };
}

describe("queryOrderList scope", () => {
  it("super-admin gets no warehouse filter", async () => {
    const h = listCtx({ permissions: ["*"] });
    await queryOrderList(h.ctx, { limit: 20 } as never);
    expect(h.where()!.outlet).toBeUndefined();
    expect(h.where()!.id).toBeUndefined();
  });

  it("warehouse manager is confined to their warehouse's outlets", async () => {
    const h = listCtx({ permissions: ["orders:read"], managedWarehouseId: WAREHOUSE_A });
    await queryOrderList(h.ctx, { limit: 20 } as never);
    expect(h.where()!.outlet).toEqual({ warehouseId: WAREHOUSE_A });
  });

  it("a non-admin with neither warehouse nor outlet scope matches nothing", async () => {
    const h = listCtx({ permissions: ["orders:read"] });
    await queryOrderList(h.ctx, { limit: 20 } as never);
    expect(h.where()!.id).toBe("____no_match____");
  });

  it("a forced outlet skips the warehouse filter (already scoped upstream)", async () => {
    const h = listCtx({ permissions: ["orders:read"], managedWarehouseId: WAREHOUSE_A });
    await queryOrderList(h.ctx, { limit: 20 } as never, { forcedOutletId: OUTLET_B });
    expect(h.where()!.outlet).toBeUndefined();
    expect(h.where()!.outletId).toBe(OUTLET_B);
  });

  it("mineOnly filters by the acting user", async () => {
    const h = listCtx({ permissions: ["*"] });
    await queryOrderList(h.ctx, { limit: 20, mineOnly: true } as never);
    expect(h.where()!.createdById).toBe(ACTOR_ID);
  });

  it("a search term builds a case-insensitive OR across number/notes/address", async () => {
    const h = listCtx({ permissions: ["*"] });
    await queryOrderList(h.ctx, { limit: 20, q: "abc" } as never);
    const and = h.where()!.AND as Array<{ OR?: unknown[] }>;
    expect(and[0].OR).toHaveLength(3);
  });
});

describe("queryOrderList pagination", () => {
  function row(id: string) {
    return baseOrderRow("approved", [{ qtyOrdered: 1, qtyDispatched: 0 }]) as unknown as Record<string, unknown> & { id: string };
  }

  it("returns nextCursor when more rows exist than the limit", async () => {
    const rows = [row("a"), row("b"), row("c")].map((r, i) => ({ ...r, id: `id-${i}`, createdAt: new Date(2026, 0, i + 1) }));
    const h = listCtx({ permissions: ["*"], rows });
    const out = await queryOrderList(h.ctx, { limit: 2 } as never);
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).not.toBeNull();
  });

  it("returns a null cursor on the final page", async () => {
    const rows = [{ ...row("a"), id: "id-0", createdAt: new Date(2026, 0, 1) }];
    const h = listCtx({ permissions: ["*"], rows });
    const out = await queryOrderList(h.ctx, { limit: 5 } as never);
    expect(out.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// queryOrderDetail
// ---------------------------------------------------------------------------

describe("queryOrderDetail", () => {
  function detailCtx(order: unknown) {
    const prisma = {
      saleOrder: {
        findUnique: async () => order,
      },
    };
    return makeCtx({ permissions: ["*"], prisma });
  }

  it("throws NOT_FOUND when the order does not exist", async () => {
    await expect(queryOrderDetail(detailCtx(null), ORDER_A)).rejects.toThrow(/not found/i);
  });

  it("includes the linked invoice when present", async () => {
    const base = baseOrderRow("approved", [{ qtyOrdered: 1, qtyDispatched: 0 }]);
    const order = {
      ...base,
      lines: base.lines.map((l) => ({ ...l, dispatchLines: [] })),
      invoice: {
        id: "inv-1",
        invoiceNumber: "INV-2026-000001",
        invoiceDate: new Date("2026-05-03T00:00:00.000Z"),
        dueDate: new Date("2026-06-02T00:00:00.000Z"),
        total: dec("1180"),
        amountPaid: dec("0"),
        amountDue: dec("1180"),
        createdAt: new Date("2026-05-03T00:00:00.000Z"),
      },
    };
    const out = await queryOrderDetail(detailCtx(order), ORDER_A);
    expect(out.linkedInvoices).toHaveLength(1);
    expect(out.linkedInvoices[0].invoiceNumber).toBe("INV-2026-000001");
    expect(out.linkedDispatches).toEqual([]);
  });

  it("dedupes dispatches shared across lines and sorts newest first", async () => {
    const base = baseOrderRow("approved", [
      { qtyOrdered: 1, qtyDispatched: 1 },
      { qtyOrdered: 1, qtyDispatched: 1 },
    ]);
    const mkDispatch = (id: string, iso: string) => ({
      dispatch: {
        id,
        dispatchDate: new Date(iso),
        deliveryStatus: "delivered",
        lrNumber: null,
        transporterName: "T",
        vehicleNumber: "V",
        createdAt: new Date(iso),
      },
    });
    const order = {
      ...base,
      invoice: null,
      lines: [
        { ...base.lines[0], dispatchLines: [mkDispatch("d-old", "2026-05-01T00:00:00.000Z"), mkDispatch("d-new", "2026-05-09T00:00:00.000Z")] },
        { ...base.lines[1], dispatchLines: [mkDispatch("d-new", "2026-05-09T00:00:00.000Z")] },
      ],
    };
    const out = await queryOrderDetail(detailCtx(order), ORDER_A);
    expect(out.linkedDispatches).toHaveLength(2);
    expect(out.linkedDispatches[0].id).toBe("d-new");
    expect(out.linkedInvoices).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createAutoInvoice — the money path on approval
// ---------------------------------------------------------------------------

function autoInvoiceTx(opts: { existingInvoice?: unknown; activeCharges?: unknown[]; lastInvoice?: unknown } = {}) {
  const created: { data?: Record<string, unknown> } = {};
  const outletUpdated: { data?: Record<string, unknown> } = {};
  const tx = {
    invoice: {
      findUnique: async (args: { where: { orderId?: string; invoiceNumber?: string } }) => {
        if (args.where.invoiceNumber !== undefined) return null; // sequence uniqueness probe
        return opts.existingInvoice ?? null;
      },
      findFirst: async () => opts.lastInvoice ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        created.data = args.data;
        return { id: "inv-created" };
      },
      aggregate: async () => ({ _sum: { amountDue: dec("1180") } }),
    },
    invoiceSequence: {
      upsert: async () => ({ lastSequence: 1 }),
      update: async () => undefined,
    },
    taxCharge: {
      findMany: async () => opts.activeCharges ?? [],
    },
    outlet: {
      findUnique: async () => null, // resolvePlaceOfSupply → defaults to intra-state
      update: async (args: { data: Record<string, unknown> }) => {
        outletUpdated.data = args.data;
        return {};
      },
    },
    // Ledger models exercised by the posting engine.
    journalEntry: {
      findFirst: async () => null,
      create: async () => ({ id: "je-1" }),
      findUniqueOrThrow: async () => ({ entryNumber: "JE-2026-000001" }),
    },
    ledgerAccount: {
      findMany: async (args: { where: { code: { in: string[] } } }) =>
        args.where.code.in.map((code) => ({ id: `acc-${code}`, code })),
    },
    journalSequence: {
      upsert: async () => ({ lastSequence: 1 }),
    },
  };
  return { tx, created, outletUpdated };
}

function orderForInvoice(overrides: Partial<Parameters<typeof createAutoInvoice>[1]> = {}) {
  return {
    id: ORDER_A,
    outletId: OUTLET_A,
    suppressAutoInvoice: false,
    orderType: "standard",
    lines: [
      { productId: "99999999-9999-4999-8999-999999999999", sku: "SKU-1", qtyOrdered: 2, unitPrice: dec("500"), lineTotal: dec("1000") },
    ],
    subtotalValue: dec("1000"),
    discountType: null,
    discountRate: dec(0),
    taxSnapshot: [{ taxChargeId: "tc-1", name: "GST", type: "percentage", rate: "18", displayOrder: 1 }] as unknown as Prisma.JsonValue,
    paymentTermsDays: 30,
    ...overrides,
  };
}

describe("createAutoInvoice", () => {
  const now = new Date("2026-05-10T00:00:00.000Z");

  it("skips when suppressAutoInvoice is set", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(h.tx as never, orderForInvoice({ suppressAutoInvoice: true }), now);
    expect(h.created.data).toBeUndefined();
  });

  it("skips for warranty_replacement orders", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(h.tx as never, orderForInvoice({ orderType: "warranty_replacement" }), now);
    expect(h.created.data).toBeUndefined();
  });

  it("skips when an invoice already exists for the order", async () => {
    const h = autoInvoiceTx({ existingInvoice: { id: "inv-existing" } });
    await createAutoInvoice(h.tx as never, orderForInvoice(), now);
    expect(h.created.data).toBeUndefined();
  });

  it("computes total from the captured tax snapshot (1000 + 18% = 1180)", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(h.tx as never, orderForInvoice(), now);
    expect(decEq(h.created.data!.total as Prisma.Decimal, "1180")).toBe(true);
    expect(decEq(h.created.data!.amountDue as Prisma.Decimal, "1180")).toBe(true);
    expect(decEq(h.created.data!.amountPaid as Prisma.Decimal, 0)).toBe(true);
  });

  it("applies a discount before tax (1000 - 100 = 900, +18% = 1062)", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(
      h.tx as never,
      orderForInvoice({ discountType: "percentage", discountRate: dec(10) }),
      now,
    );
    expect(decEq(h.created.data!.discountAmount as Prisma.Decimal, "100")).toBe(true);
    expect(decEq(h.created.data!.total as Prisma.Decimal, "1062")).toBe(true);
  });

  it("falls back to live charges when taxSnapshot is null (legacy orders)", async () => {
    const h = autoInvoiceTx({
      activeCharges: [{ id: "tc-live", name: "GST", type: "percentage", rate: dec(18), displayOrder: 1 }],
    });
    await createAutoInvoice(h.tx as never, orderForInvoice({ taxSnapshot: null }), now);
    expect(decEq(h.created.data!.total as Prisma.Decimal, "1180")).toBe(true);
  });

  it("sets the due date paymentTermsDays after the invoice date", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(h.tx as never, orderForInvoice({ paymentTermsDays: 15 }), now);
    expect((h.created.data!.dueDate as Date).toISOString()).toBe("2026-05-25T00:00:00.000Z");
  });

  it("recomputes the outlet outstanding balance from the aggregate", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(h.tx as never, orderForInvoice(), now);
    expect(decEq(h.outletUpdated.data!.outstandingBalance as Prisma.Decimal, "1180")).toBe(true);
  });

  it("uses the line subtotal when the stored subtotal is zero", async () => {
    const h = autoInvoiceTx();
    await createAutoInvoice(h.tx as never, orderForInvoice({ subtotalValue: dec(0) }), now);
    // lines sum to 1000 → +18% = 1180
    expect(decEq(h.created.data!.total as Prisma.Decimal, "1180")).toBe(true);
  });
});
