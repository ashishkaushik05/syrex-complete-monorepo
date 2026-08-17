import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import type { TrpcContext } from "../context";
import { apiError } from "../error";
import { SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { actorHasInternalSalesOutletAccess } from "./outlet-access";
import { postInvoiceCreated } from "../../accounts/posting";

// ---------------------------------------------------------------------------
// Charge / discount helpers (shared by order creation and auto-invoice)
// ---------------------------------------------------------------------------

export type ChargeType = "percentage" | "fixed";

export type ChargeDefinition = {
  taxChargeId: string | null;
  name: string;
  type: ChargeType;
  rate: Prisma.Decimal;
  displayOrder: number;
};

export function parseDecimal(value: unknown): Prisma.Decimal | null {
  try {
    if (typeof value === "string" || typeof value === "number") {
      return new Prisma.Decimal(value);
    }
    return null;
  } catch {
    return null;
  }
}

export function computeDiscountAmount(
  subtotal: Prisma.Decimal,
  discountType: ChargeType | null,
  discountRate: Prisma.Decimal,
) {
  if (subtotal.lte(0) || discountRate.lte(0) || !discountType) {
    return new Prisma.Decimal(0);
  }
  if (discountType === "percentage") {
    const rate = Prisma.Decimal.min(discountRate, new Prisma.Decimal(100));
    return subtotal.mul(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }
  return Prisma.Decimal.min(subtotal, discountRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function computeChargeRows(
  taxableSubtotal: Prisma.Decimal,
  charges: ChargeDefinition[],
) {
  return charges.map((c) => {
    const amount =
      c.type === "percentage"
        ? taxableSubtotal.mul(c.rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : c.rate.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return {
      taxChargeId: c.taxChargeId,
      name: c.name,
      type: c.type,
      rate: c.rate,
      amount,
      displayOrder: c.displayOrder,
    };
  });
}

export function parseChargeSnapshot(snapshot: Prisma.JsonValue | null): ChargeDefinition[] {
  if (!snapshot || !Array.isArray(snapshot)) return [];
  const rows: ChargeDefinition[] = [];
  for (const item of snapshot) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const type = row.type === "percentage" || row.type === "fixed" ? row.type : null;
    const name = typeof row.name === "string" ? row.name : null;
    const displayOrder =
      typeof row.displayOrder === "number" && Number.isInteger(row.displayOrder)
        ? row.displayOrder
        : null;
    const rate = parseDecimal(row.rate);
    if (!type || !name || displayOrder === null || !rate) continue;
    const taxChargeId = typeof row.taxChargeId === "string" ? row.taxChargeId : null;
    rows.push({ taxChargeId, name, type, rate, displayOrder });
  }
  return rows.sort((a, b) => a.displayOrder - b.displayOrder);
}

// ---------------------------------------------------------------------------
// Generic document sequence number allocator (orders + invoices)
// ---------------------------------------------------------------------------

type SequenceSpec = {
  prefix: string;
  upsertSequence: () => Promise<{ lastSequence: number }>;
  findByNumber: (number: string) => Promise<{ id: string } | null>;
  findLastByPrefix: () => Promise<{ seq: number } | null>;
  updateSequence: (seq: number) => Promise<void>;
};

async function nextDocumentNumber(spec: SequenceSpec): Promise<string> {
  const row = await spec.upsertSequence();
  let sequence = row.lastSequence;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const number = `${spec.prefix}${String(sequence).padStart(6, "0")}`;
    const existing = await spec.findByNumber(number);
    if (!existing) return number;

    const last = await spec.findLastByPrefix();
    const maxSeq = last ? last.seq : sequence;
    sequence = maxSeq + 1;
    await spec.updateSequence(sequence);
  }

  throw apiError("CONFLICT", "Could not allocate a unique document number");
}

export async function nextOrderNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `SO-${year}-`;
  return nextDocumentNumber({
    prefix,
    upsertSequence: () =>
      tx.orderSequence.upsert({
        where: { year },
        create: { year, lastSequence: 1 },
        update: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      }),
    findByNumber: (n) =>
      tx.saleOrder.findUnique({ where: { orderNumber: n }, select: { id: true } }),
    findLastByPrefix: async () => {
      const row = await tx.saleOrder.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      if (!row) return null;
      const seq = Number.parseInt(row.orderNumber.slice(prefix.length), 10);
      return Number.isNaN(seq) ? null : { seq };
    },
    updateSequence: async (seq) => {
      await tx.orderSequence.update({ where: { year }, data: { lastSequence: seq } });
    },
  });
}

export async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `INV-${year}-`;
  return nextDocumentNumber({
    prefix,
    upsertSequence: () =>
      tx.invoiceSequence.upsert({
        where: { year },
        create: { year, lastSequence: 1 },
        update: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      }),
    findByNumber: (n) =>
      tx.invoice.findUnique({ where: { invoiceNumber: n }, select: { id: true } }),
    findLastByPrefix: async () => {
      const row = await tx.invoice.findFirst({
        where: { invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: "desc" },
        select: { invoiceNumber: true },
      });
      if (!row) return null;
      const seq = Number.parseInt(row.invoiceNumber.slice(prefix.length), 10);
      return Number.isNaN(seq) ? null : { seq };
    },
    updateSequence: async (seq) => {
      await tx.invoiceSequence.update({ where: { year }, data: { lastSequence: seq } });
    },
  });
}

// ---------------------------------------------------------------------------
// Auto-invoice creation on order approval
// ---------------------------------------------------------------------------

export async function createAutoInvoice(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    outletId: string;
    suppressAutoInvoice: boolean;
    orderType: string;
    lines: Array<{
      productId: string;
      sku: string;
      qtyOrdered: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
    subtotalValue: Prisma.Decimal;
    discountType: "percentage" | "fixed" | null;
    discountRate: Prisma.Decimal;
    taxSnapshot: Prisma.JsonValue | null;
    paymentTermsDays: number;
  },
  now: Date,
): Promise<void> {
  if (order.suppressAutoInvoice || order.orderType === "warranty_replacement") {
    return;
  }

  const existingInvoice = await tx.invoice.findUnique({
    where: { orderId: order.id },
  });
  if (existingInvoice) {
    return;
  }

  const invoiceNumber = await nextInvoiceNumber(tx, now);

  const lineSubtotal = order.lines.reduce(
    (sum, line) => sum.add(line.lineTotal),
    new Prisma.Decimal(0),
  );
  const subtotal =
    order.subtotalValue.gt(0) || lineSubtotal.eq(0)
      ? order.subtotalValue
      : lineSubtotal;

  const discountAmount = computeDiscountAmount(subtotal, order.discountType, order.discountRate);
  const taxableSubtotal = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.sub(discountAmount));

  // Use the snapshot captured at order-creation time so that tax-rate changes
  // after the order was placed don't silently alter the invoice amount.
  // taxSnapshot === null means a legacy order created before snapshots were
  // introduced — fall back to live charges for those only.
  const rawSnapshot = order.taxSnapshot;
  let chargeDefs = parseChargeSnapshot(rawSnapshot);
  if (rawSnapshot === null) {
    const activeCharges = await tx.taxCharge.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    chargeDefs = activeCharges.map((c) => ({
      taxChargeId: c.id,
      name: c.name,
      type: c.type as ChargeType,
      rate: c.rate,
      displayOrder: c.displayOrder,
    }));
  }

  const chargesData = computeChargeRows(taxableSubtotal, chargeDefs);
  const chargesTotal = chargesData.reduce(
    (sum, c) => sum.add(c.amount),
    new Prisma.Decimal(0),
  );
  const total = taxableSubtotal.add(chargesTotal);

  const dueDate = new Date(now);
  dueDate.setUTCDate(dueDate.getUTCDate() + order.paymentTermsDays);

  const taxSnapshot = chargeDefs.map((c) => ({
    taxChargeId: c.taxChargeId,
    name: c.name,
    type: c.type,
    rate: c.rate.toFixed(2),
    displayOrder: c.displayOrder,
  }));

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      orderId: order.id,
      outletId: order.outletId,
      invoiceDate: now,
      dueDate,
      subtotal,
      discountType: order.discountType,
      discountRate: order.discountRate,
      discountAmount,
      taxSnapshot,
      total,
      amountPaid: new Prisma.Decimal(0),
      amountDue: total,
      lines: {
        create: order.lines.map((line) => ({
          productId: line.productId,
          sku: line.sku,
          qty: line.qtyOrdered,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
      },
      charges: {
        create: chargesData,
      },
    },
    select: { id: true },
  });

  // Post the double-entry journal for this invoice:
  //   Dr Debtors (outlet) · Cr Sales (taxable subtotal) · Cr GST Output (charges, split by place-of-supply)
  await postInvoiceCreated(tx, {
    invoiceId: invoice.id,
    invoiceNumber,
    outletId: order.outletId,
    invoiceDate: now,
    sales: taxableSubtotal,
    gstTotal: chargesTotal,
    total,
  });

  const outstanding = await tx.invoice.aggregate({
    where: { outletId: order.outletId },
    _sum: { amountDue: true },
  });

  await tx.outlet.update({
    where: { id: order.outletId },
    data: {
      outstandingBalance: outstanding._sum.amountDue ?? new Prisma.Decimal(0),
    },
  });
}

export const orderLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  qtyOrdered: z.number().int(),
  qtyDispatched: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  status: z.enum(["pending", "partially_dispatched", "fully_dispatched"]),
});

export const orderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  outletId: z.string(),
  orderType: z.string(),
  sourceComplaintId: z.string().nullable(),
  sourceWarehouseId: z.string().nullable(),
  suppressAutoInvoice: z.boolean(),
  serviceMetadata: z.unknown().nullable(),
  createdById: z.string().nullable(),
  orderDate: z.string(),
  deliveryAddress: z.string(),
  status: z.enum([
    "pending_approval",
    "approved",
    "partially_dispatched",
    "fully_dispatched",
    "rejected",
    "cancelled",
    "on_hold",
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  subtotalValue: z.string(),
  discountType: z.enum(["percentage", "fixed"]).nullable(),
  discountRate: z.string(),
  discountAmount: z.string(),
  taxableValue: z.string(),
  taxSnapshot: z.unknown().nullable(),
  taxTotal: z.string(),
  paymentTermsDays: z.number().int(),
  totalValue: z.string(),
  approvedById: z.string().nullable(),
  approvedAt: z.string().nullable(),
  heldById: z.string().nullable(),
  heldAt: z.string().nullable(),
  holdNote: z.string().nullable(),
  approvalNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(orderLineSchema),
});

export const orderLinkedInvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  total: z.string(),
  amountPaid: z.string(),
  amountDue: z.string(),
  createdAt: z.string(),
});

export const orderLinkedDispatchSchema = z.object({
  id: z.string(),
  dispatchDate: z.string(),
  deliveryStatus: z.string(),
  lrNumber: z.string().nullable(),
  transporterName: z.string(),
  vehicleNumber: z.string(),
  createdAt: z.string(),
});

export const orderDetailSchema = orderSchema.extend({
  linkedInvoices: z.array(orderLinkedInvoiceSchema),
  linkedDispatches: z.array(orderLinkedDispatchSchema),
});

export const orderListFilterSchema = paginationInputSchema.extend({
  outletId: z.string().uuid().optional(),
  mineOnly: z.boolean().optional(),
  status: z
    .enum([
      "pending_approval",
      "approved",
      "partially_dispatched",
      "fully_dispatched",
      "rejected",
      "cancelled",
      "on_hold",
    ])
    .optional(),
  q: z.string().min(1).optional(),
  orderType: z.string().optional(),
  sourceComplaintId: z.string().uuid().optional(),
});

export type OrderListFilter = z.infer<typeof orderListFilterSchema>;

function toLineStatus(qtyOrdered: number, qtyDispatched: number) {
  if (qtyDispatched <= 0) {
    return "pending" as const;
  }
  if (qtyDispatched >= qtyOrdered) {
    return "fully_dispatched" as const;
  }
  return "partially_dispatched" as const;
}

function toOrderStatus(order: {
  status: OrderStatus;
  lines: Array<{ qtyOrdered: number; qtyDispatched: number }>;
}) {
  if (order.status !== "approved") {
    return order.status;
  }

  if (order.lines.length === 0) {
    return order.status;
  }

  const allFull = order.lines.every(
    (line) => line.qtyDispatched >= line.qtyOrdered,
  );
  if (allFull) {
    return "fully_dispatched" as const;
  }

  const anyDispatched = order.lines.some((line) => line.qtyDispatched > 0);
  if (anyDispatched) {
    return "partially_dispatched" as const;
  }

  return "approved" as const;
}

export function serializeOrder(order: {
  id: string;
  orderNumber: string;
  outletId: string;
  orderType: string;
  sourceComplaintId: string | null;
  sourceWarehouseId: string | null;
  suppressAutoInvoice: boolean;
  serviceMetadata: Prisma.JsonValue | null;
  createdById: string | null;
  orderDate: Date;
  deliveryAddress: string;
  status: OrderStatus;
  priority: "low" | "medium" | "high" | "critical";
  totalValue: Prisma.Decimal;
  subtotalValue: Prisma.Decimal;
  discountType: "percentage" | "fixed" | null;
  discountRate: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxableValue: Prisma.Decimal;
  taxSnapshot: Prisma.JsonValue | null;
  taxTotal: Prisma.Decimal;
  paymentTermsDays: number;
  approvedById: string | null;
  approvedAt: Date | null;
  heldById: string | null;
  heldAt: Date | null;
  holdNote: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    productId: string;
    sku: string;
    qtyOrdered: number;
    qtyDispatched: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
}) {
  const derivedStatus = toOrderStatus(order);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    outletId: order.outletId,
    orderType: order.orderType,
    sourceComplaintId: order.sourceComplaintId,
    sourceWarehouseId: order.sourceWarehouseId,
    suppressAutoInvoice: order.suppressAutoInvoice,
    serviceMetadata: order.serviceMetadata,
    createdById: order.createdById,
    orderDate: order.orderDate.toISOString(),
    deliveryAddress: order.deliveryAddress,
    status: derivedStatus,
    priority: order.priority,
    subtotalValue: order.subtotalValue.toString(),
    discountType: order.discountType,
    discountRate: order.discountRate.toString(),
    discountAmount: order.discountAmount.toString(),
    taxableValue: order.taxableValue.toString(),
    taxSnapshot: order.taxSnapshot,
    taxTotal: order.taxTotal.toString(),
    paymentTermsDays: order.paymentTermsDays,
    totalValue: order.totalValue.toString(),
    approvedById: order.approvedById,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    heldById: order.heldById,
    heldAt: order.heldAt?.toISOString() ?? null,
    holdNote: order.holdNote,
    approvalNote: order.approvalNote,
    rejectionReason: order.rejectionReason,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      sku: line.sku,
      qtyOrdered: line.qtyOrdered,
      qtyDispatched: line.qtyDispatched,
      unitPrice: line.unitPrice.toString(),
      lineTotal: line.lineTotal.toString(),
      status: toLineStatus(line.qtyOrdered, line.qtyDispatched),
    })),
  };
}

export async function queryOrderList(
  ctx: TrpcContext,
  input: OrderListFilter,
  options?: { forcedOutletId?: string },
): Promise<{
  items: Array<z.infer<typeof orderSchema>>;
  nextCursor: string | null;
}> {
  const cursor = decodeCursor(input.cursor);
  const effectiveOutletId = options?.forcedOutletId ?? input.outletId;
  const isAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
  const hasInternalSalesAccess = actorHasInternalSalesOutletAccess(ctx);
  // Outlet-scoped calls have already passed assertOutletAccess; skip warehouse filter.
  const warehouseFilter = isAdmin || hasInternalSalesAccess || effectiveOutletId
    ? {}
    : ctx.managedWarehouseId
      ? { outlet: { warehouseId: ctx.managedWarehouseId } }
      : { id: "____no_match____" };

  const rows = await ctx.prisma.saleOrder.findMany({
    where: {
      ...warehouseFilter,
      outletId: effectiveOutletId,
      createdById: input.mineOnly ? ctx.actor.id : undefined,
      status: input.status,
      orderType: input.orderType,
      sourceComplaintId: input.sourceComplaintId,
      AND: [
        ...(input.q ? [{ OR: [{ orderNumber: { contains: input.q, mode: "insensitive" as const } }, { notes: { contains: input.q, mode: "insensitive" as const } }, { deliveryAddress: { contains: input.q, mode: "insensitive" as const } }] }] : []),
        ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
      ],
    },
    include: {
      lines: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });

  const hasMore = rows.length > input.limit;
  const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    items: pageItems.map((item) => serializeOrder(item)),
    nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null,
  };
}

export async function queryOrderDetail(
  ctx: TrpcContext,
  id: string,
): Promise<z.infer<typeof orderDetailSchema>> {
  const order = await ctx.prisma.saleOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          dispatchLines: {
            include: {
              dispatch: true,
            },
          },
        },
      },
      invoice: true,
    },
  });

  if (!order) {
    throw apiError("NOT_FOUND", "Order not found");
  }

  const dispatchMap = new Map<
    string,
    {
      id: string;
      dispatchDate: string;
      deliveryStatus: string;
      lrNumber: string | null;
      transporterName: string;
      vehicleNumber: string;
      createdAt: string;
    }
  >();

  for (const line of order.lines) {
    for (const dispatchLine of line.dispatchLines) {
      const dispatch = dispatchLine.dispatch;
      if (!dispatchMap.has(dispatch.id)) {
        dispatchMap.set(dispatch.id, {
          id: dispatch.id,
          dispatchDate: dispatch.dispatchDate.toISOString(),
          deliveryStatus: dispatch.deliveryStatus,
          lrNumber: dispatch.lrNumber,
          transporterName: dispatch.transporterName,
          vehicleNumber: dispatch.vehicleNumber,
          createdAt: dispatch.createdAt.toISOString(),
        });
      }
    }
  }

  const linkedInvoices = order.invoice
    ? [
        {
          id: order.invoice.id,
          invoiceNumber: order.invoice.invoiceNumber,
          invoiceDate: order.invoice.invoiceDate.toISOString(),
          dueDate: order.invoice.dueDate?.toISOString() ?? null,
          total: order.invoice.total.toString(),
          amountPaid: order.invoice.amountPaid.toString(),
          amountDue: order.invoice.amountDue.toString(),
          createdAt: order.invoice.createdAt.toISOString(),
        },
      ]
    : [];

  const linkedDispatches = Array.from(dispatchMap.values()).sort((a, b) => {
    const timeDiff =
      new Date(b.dispatchDate).getTime() - new Date(a.dispatchDate).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id);
  });

  return {
    ...serializeOrder(order),
    linkedInvoices,
    linkedDispatches,
  };
}
