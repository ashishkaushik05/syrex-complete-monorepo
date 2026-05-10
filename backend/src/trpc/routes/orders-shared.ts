import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import type { TrpcContext } from "../context";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

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
  createdById: string | null;
  orderDate: Date;
  deliveryAddress: string;
  status: OrderStatus;
  priority: "low" | "medium" | "high" | "critical";
  totalValue: Prisma.Decimal;
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
    createdById: order.createdById,
    orderDate: order.orderDate.toISOString(),
    deliveryAddress: order.deliveryAddress,
    status: derivedStatus,
    priority: order.priority,
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
  const offset = decodeCursor(input.cursor) ?? 0;
  const effectiveOutletId = options?.forcedOutletId ?? input.outletId;
  const isAdmin = ctx.permissions.includes("*");
  // Outlet-scoped calls have already passed assertOutletAccess; skip warehouse filter.
  const warehouseFilter = isAdmin || effectiveOutletId
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
      OR: input.q
        ? [
            { orderNumber: { contains: input.q, mode: "insensitive" } },
            { notes: { contains: input.q, mode: "insensitive" } },
            { deliveryAddress: { contains: input.q, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: {
      lines: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: input.limit + 1,
  });

  const hasMore = rows.length > input.limit;
  const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    items: pageItems.map((item) => serializeOrder(item)),
    nextCursor: hasMore ? encodeCursor(offset + input.limit) : null,
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
