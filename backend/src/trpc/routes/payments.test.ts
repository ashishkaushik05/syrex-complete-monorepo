import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { P } from "../../rbac/catalog";
import { paymentsRouter } from "./payments";
import { ACTOR_ID, dec, decEq, makeCtx, OUTLET_A, OUTLET_B, WAREHOUSE_A, WAREHOUSE_B } from "./__testkit__";

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

  return paymentsRouter.createCaller(
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

// ── Phase 3 ASVF hardening (DEC-20260613-010) ────────────────────────────────

const INV_1 = "10000000-0000-4000-8000-000000000001";
const INV_2 = "10000000-0000-4000-8000-000000000002";

type InvoiceRow = {
  id: string;
  outletId: string;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountDue: Prisma.Decimal;
  invoiceDate: Date;
};

function makeInvoice(id: string, outletId: string, total: number, paid: number, date: string): InvoiceRow {
  return {
    id,
    outletId,
    total: dec(total),
    amountPaid: dec(paid),
    amountDue: dec(total).sub(dec(paid)),
    invoiceDate: new Date(date),
  };
}

// Stateful prisma double for the create/void money flows. Mutates invoice rows
// exactly as the optimistic updateMany predicate would, so the asserted totals
// are produced by the route's own allocation math — not echoed back.
function moneyPrisma(opts: {
  invoices: InvoiceRow[];
  outletExists?: boolean;
  idempotentExisting?: any;
  existingPayment?: any;
}) {
  const invoices = new Map(opts.invoices.map((i) => [i.id, { ...i }]));
  const allocations: any[] = [];
  const reversals: any[] = [];
  let payment: any = opts.existingPayment ?? null;

  const fullPayment = () => ({
    ...payment,
    allocations: payment?.allocations ?? allocations,
    reversal: reversals[0] ?? payment?.reversal ?? null,
  });

  const api: any = {
    outlet: {
      findUnique: async () => null,
      findUniqueOrThrow: async ({ where }: any) => {
        if (opts.outletExists === false) throw new Error("not found");
        return { id: where.id, warehouseId: null };
      },
      update: async ({ where }: any) => ({ id: where.id }),
    },
    outletPayment: {
      findUnique: async ({ where, select }: any) => {
        if (where.idempotencyKey) return opts.idempotentExisting ?? null;
        if (select?.outletId) return payment ? { outletId: payment.outletId } : null;
        return payment ? fullPayment() : null;
      },
      create: async ({ data }: any) => {
        payment = {
          id: "pay-created-1",
          voidedAt: null,
          voidedById: null,
          voidReason: null,
          createdAt: new Date("2026-05-20T10:00:00.000Z"),
          ...data,
          reference: data.reference ?? null,
          description: data.description ?? null,
          allocations,
        };
        return payment;
      },
      update: async ({ data }: any) => {
        payment = { ...payment, ...data };
        return payment;
      },
      findUniqueOrThrow: async () => fullPayment(),
    },
    invoice: {
      findMany: async ({ where }: any) =>
        [...invoices.values()]
          .filter((i) => i.outletId === where.outletId && (where.amountDue ? i.amountDue.gt(0) : true))
          .sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime() || (a.id < b.id ? -1 : 1)),
      findUnique: async ({ where }: any) => invoices.get(where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const inv = invoices.get(where.id);
        if (!inv) return { count: 0 };
        if (!inv.amountPaid.equals(where.amountPaid) || !inv.amountDue.equals(where.amountDue)) {
          return { count: 0 };
        }
        inv.amountPaid = data.amountPaid;
        inv.amountDue = data.amountDue;
        return { count: 1 };
      },
      aggregate: async ({ where }: any) => {
        const sum = [...invoices.values()]
          .filter((i) => i.outletId === where.outletId)
          .reduce((acc, i) => acc.add(i.amountDue), dec(0));
        return { _sum: { amountDue: sum } };
      },
    },
    outletPaymentAllocation: {
      create: async ({ data }: any) => {
        const row = { id: `alloc-${allocations.length + 1}`, allocatedAt: new Date("2026-05-20T10:00:00.000Z"), ...data };
        allocations.push(row);
        return row;
      },
    },
    outletPaymentReversal: {
      create: async ({ data }: any) => {
        const row = { id: "rev-1", ...data };
        reversals.push(row);
        return row;
      },
    },
    // Ledger models exercised by the posting engine (Dr Bank / Cr Debtors etc.).
    journalEntry: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: "je-1", ...data }),
      findUniqueOrThrow: async () => ({ entryNumber: "JE-2026-000001" }),
    },
    ledgerAccount: {
      findMany: async ({ where }: any) =>
        (where.code.in as string[]).map((code) => ({ id: `acc-${code}`, code })),
    },
    journalSequence: {
      upsert: async () => ({ lastSequence: 1 }),
    },
    $transaction: async (fn: any) => fn(api),
  };

  return { api, invoices, get allocations() { return allocations; } };
}

function moneyCaller(prisma: any, overrides: { permissions?: string[]; linkedOutletId?: string | null; managedWarehouseId?: string | null } = {}) {
  return paymentsRouter.createCaller(
    makeCtx({
      actorId: ACTOR_ID,
      prisma,
      permissions: overrides.permissions ?? ["*"],
      linkedOutletId: overrides.linkedOutletId ?? null,
      managedWarehouseId: overrides.managedWarehouseId ?? null,
    }),
  );
}

describe("payments auth gates (DEC-20260613-010)", () => {
  const noPerm = { permissions: [] as string[], linkedOutletId: null, managedWarehouseId: null, payments: [], outletWarehouseById: {} };

  it("list requires payments:read", async () => {
    await expect(createCaller(noPerm).list({ limit: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("getById requires payments:read", async () => {
    await expect(createCaller(noPerm).getById({ id: PAYMENT_A })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("create requires payments:write", async () => {
    await expect(
      moneyCaller(moneyPrisma({ invoices: [] }).api, { permissions: [] }).create({ outletId: OUTLET_A, amount: "10" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("void requires payments:void", async () => {
    await expect(
      moneyCaller(moneyPrisma({ invoices: [] }).api, { permissions: [] }).void({ id: PAYMENT_A, reason: "test reason" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("payments.create allocation math (DEC-20260613-010)", () => {
  it("allocates FIFO across open invoices, oldest first (Happy)", async () => {
    const store = moneyPrisma({
      invoices: [
        makeInvoice(INV_2, OUTLET_A, 500, 0, "2026-05-10T00:00:00.000Z"),
        makeInvoice(INV_1, OUTLET_A, 600, 0, "2026-05-01T00:00:00.000Z"),
      ],
    });
    const out = await moneyCaller(store.api).create({ outletId: OUTLET_A, amount: "1000" });

    // 600 to the oldest invoice (fully paid), 400 to the next (100 still due).
    expect(out.allocations).toHaveLength(2);
    const byInvoice = Object.fromEntries(out.allocations.map((a) => [a.invoiceId, a.amount]));
    expect(byInvoice[INV_1]).toBe("600");
    expect(byInvoice[INV_2]).toBe("400");
    expect(decEq(store.invoices.get(INV_1)!.amountDue, 0)).toBe(true);
    expect(decEq(store.invoices.get(INV_2)!.amountDue, 100)).toBe(true);
  });

  it("leaves the surplus unallocated on over-payment (Failure/edge)", async () => {
    const store = moneyPrisma({
      invoices: [makeInvoice(INV_1, OUTLET_A, 600, 0, "2026-05-01T00:00:00.000Z")],
    });
    const out = await moneyCaller(store.api).create({ outletId: OUTLET_A, amount: "1000" });

    // Only the 600 due is allocated; the 400 surplus is recorded but unapplied.
    expect(out.allocations).toHaveLength(1);
    expect(out.allocations[0].amount).toBe("600");
    expect(out.amount).toBe("1000");
    expect(decEq(store.invoices.get(INV_1)!.amountDue, 0)).toBe(true);
  });

  it("returns the existing payment for a replayed idempotency key (Happy)", async () => {
    const existing = {
      id: "pay-existing",
      outletId: OUTLET_A,
      amount: dec(250),
      paymentDate: new Date("2026-05-19T00:00:00.000Z"),
      reference: null,
      description: null,
      createdAt: new Date("2026-05-19T00:00:00.000Z"),
      allocations: [],
      reversal: null,
    };
    const store = moneyPrisma({ invoices: [makeInvoice(INV_1, OUTLET_A, 600, 0, "2026-05-01T00:00:00.000Z")], idempotentExisting: existing });
    const out = await moneyCaller(store.api).create({
      outletId: OUTLET_A,
      amount: "250",
      idempotencyKey: "fdfdfdfd-fdfd-4fdf-8fdf-fdfdfdfdfdfd",
    });
    // Replay short-circuits before any allocation happens.
    expect(out.id).toBe("pay-existing");
    expect(store.allocations).toHaveLength(0);
    expect(decEq(store.invoices.get(INV_1)!.amountDue, 600)).toBe(true);
  });

  it("rejects a zero amount (Validation)", async () => {
    await expect(
      moneyCaller(moneyPrisma({ invoices: [] }).api).create({ outletId: OUTLET_A, amount: "0" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Payment amount must be greater than zero" });
  });

  it("rejects a negative / non-numeric amount before the handler (Validation)", async () => {
    const caller = moneyCaller(moneyPrisma({ invoices: [] }).api);
    await expect(caller.create({ outletId: OUTLET_A, amount: "-5" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.create({ outletId: OUTLET_A, amount: "abc" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a non-existent outlet (Failure)", async () => {
    await expect(
      moneyCaller(moneyPrisma({ invoices: [], outletExists: false }).api).create({ outletId: OUTLET_A, amount: "10" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invalid outletId" });
  });

  it("forbids an outlet-linked user paying for another outlet (Scope)", async () => {
    await expect(
      moneyCaller(moneyPrisma({ invoices: [] }).api, { permissions: [P.payments.write], linkedOutletId: OUTLET_A }).create({
        outletId: OUTLET_B,
        amount: "10",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Access denied to this outlet" });
  });
});

describe("payments.void reversal (DEC-20260613-010)", () => {
  function voidableStore() {
    return moneyPrisma({
      invoices: [makeInvoice(INV_1, OUTLET_A, 600, 600, "2026-05-01T00:00:00.000Z")],
      existingPayment: {
        id: PAYMENT_A,
        outletId: OUTLET_A,
        amount: dec(600),
        paymentDate: new Date("2026-05-20T10:00:00.000Z"),
        reference: null,
        description: null,
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
        voidedAt: null,
        voidedById: null,
        voidReason: null,
        reversal: null,
        allocations: [{ id: "alloc-1", invoiceId: INV_1, amount: dec(600), allocatedAt: new Date("2026-05-20T10:00:00.000Z") }],
      },
    });
  }

  it("reverses allocations and restores invoice balance (Happy)", async () => {
    const store = voidableStore();
    const out = await moneyCaller(store.api).void({ id: PAYMENT_A, reason: "duplicate entry" });

    expect(out.voidedAt).not.toBeNull();
    expect(out.reversal).not.toBeNull();
    expect(out.reversal?.reason).toBe("duplicate entry");
    // The invoice's 600 is released back to amountDue.
    expect(decEq(store.invoices.get(INV_1)!.amountDue, 600)).toBe(true);
    expect(decEq(store.invoices.get(INV_1)!.amountPaid, 0)).toBe(true);
  });

  it("rejects voiding an already-voided payment (Failure)", async () => {
    const store = moneyPrisma({
      invoices: [makeInvoice(INV_1, OUTLET_A, 600, 0, "2026-05-01T00:00:00.000Z")],
      existingPayment: {
        id: PAYMENT_A,
        outletId: OUTLET_A,
        amount: dec(600),
        paymentDate: new Date(),
        reference: null,
        description: null,
        createdAt: new Date(),
        voidedAt: new Date(),
        voidedById: ACTOR_ID,
        voidReason: "already gone",
        reversal: null,
        allocations: [],
      },
    });
    await expect(moneyCaller(store.api).void({ id: PAYMENT_A, reason: "second try" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("returns NOT_FOUND for an unknown payment (Failure)", async () => {
    const store = moneyPrisma({ invoices: [] }); // no existingPayment
    await expect(moneyCaller(store.api).void({ id: PAYMENT_A, reason: "no such payment" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a too-short reason (Validation)", async () => {
    await expect(
      moneyCaller(voidableStore().api).void({ id: PAYMENT_A, reason: "x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("forbids an outlet-linked user voiding another outlet's payment (Scope)", async () => {
    const store = moneyPrisma({
      invoices: [],
      existingPayment: {
        id: PAYMENT_A,
        outletId: OUTLET_B,
        amount: dec(100),
        paymentDate: new Date(),
        reference: null,
        description: null,
        createdAt: new Date(),
        voidedAt: null,
        voidedById: null,
        voidReason: null,
        reversal: null,
        allocations: [],
      },
    });
    await expect(
      moneyCaller(store.api, { permissions: [P.payments.void], linkedOutletId: OUTLET_A }).void({ id: PAYMENT_A, reason: "wrong outlet" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
