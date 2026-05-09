import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const orderLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  qtyOrdered: z.number().int(),
  qtyDispatched: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  status: z.enum(["pending", "partially_dispatched", "fully_dispatched"])
});

const orderSchema = z.object({
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
    "on_hold"
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
  lines: z.array(orderLineSchema)
});

const orderLinkedInvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  total: z.string(),
  amountPaid: z.string(),
  amountDue: z.string(),
  createdAt: z.string()
});

const orderLinkedDispatchSchema = z.object({
  id: z.string(),
  dispatchDate: z.string(),
  deliveryStatus: z.string(),
  lrNumber: z.string().nullable(),
  transporterName: z.string(),
  vehicleNumber: z.string(),
  createdAt: z.string()
});

const orderDetailSchema = orderSchema.extend({
  linkedInvoices: z.array(orderLinkedInvoiceSchema),
  linkedDispatches: z.array(orderLinkedDispatchSchema)
});

const orderLineInputSchema = z.object({
  productId: z.string().uuid(),
  qtyOrdered: z.number().int().positive(),
  unitPrice: z.string().min(1)
});

const transitionActionSchema = z.enum(["approve", "hold", "reject", "cancel"]);

function toLineStatus(qtyOrdered: number, qtyDispatched: number) {
  if (qtyDispatched <= 0) {
    return "pending" as const;
  }
  if (qtyDispatched >= qtyOrdered) {
    return "fully_dispatched" as const;
  }
  return "partially_dispatched" as const;
}

function toOrderStatus(order: { status: OrderStatus; lines: Array<{ qtyOrdered: number; qtyDispatched: number }> }) {
  if (order.status !== "approved") {
    return order.status;
  }

  if (order.lines.length === 0) {
    return order.status;
  }

  const allFull = order.lines.every((line) => line.qtyDispatched >= line.qtyOrdered);
  if (allFull) {
    return "fully_dispatched" as const;
  }

  const anyDispatched = order.lines.some((line) => line.qtyDispatched > 0);
  if (anyDispatched) {
    return "partially_dispatched" as const;
  }

  return "approved" as const;
}

function serializeOrder(order: {
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
      status: toLineStatus(line.qtyOrdered, line.qtyDispatched)
    }))
  };
}

async function nextOrderNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const row = await tx.orderSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true }
  });
  return `SO-${year}-${String(row.lastSequence).padStart(6, "0")}`;
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const row = await tx.invoiceSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true }
  });
  return `INV-${year}-${String(row.lastSequence).padStart(6, "0")}`;
}

export const ordersRouter = createTRPCRouter({
  list: perm("orders:read")
    .input(
      paginationInputSchema.extend({
        outletId: z.string().uuid().optional(),
        status: z
          .enum([
            "pending_approval",
            "approved",
            "partially_dispatched",
            "fully_dispatched",
            "rejected",
            "cancelled",
            "on_hold"
          ])
          .optional(),
        q: z.string().min(1).optional()
      })
    )
    .output(
      z.object({
        items: z.array(orderSchema.omit({ lines: true }).extend({ lines: z.array(orderLineSchema).optional() })),
        nextCursor: z.string().nullable()
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const isAdmin = ctx.permissions.includes("*");
      const warehouseFilter = isAdmin
        ? {}
        : ctx.managedWarehouseId
          ? { outlet: { warehouseId: ctx.managedWarehouseId } }
          : { id: "____no_match____" };
      const rows = await ctx.prisma.saleOrder.findMany({
        where: {
          ...warehouseFilter,
          outletId: input.outletId,
          status: input.status,
          OR: input.q
            ? [
                { orderNumber: { contains: input.q, mode: "insensitive" } },
                { notes: { contains: input.q, mode: "insensitive" } },
                { deliveryAddress: { contains: input.q, mode: "insensitive" } }
              ]
            : undefined
        },
        include: {
          lines: true
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items: pageItems.map((item) => serializeOrder(item)),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm("orders:read")
    .input(z.object({ id: z.string().uuid() }))
    .output(orderDetailSchema)
    .query(async ({ ctx, input }) => {
      const order = await ctx.prisma.saleOrder.findUnique({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              dispatchLines: {
                include: {
                  dispatch: true
                }
              }
            }
          },
          invoice: true
        }
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
              createdAt: dispatch.createdAt.toISOString()
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
              createdAt: order.invoice.createdAt.toISOString()
            }
          ]
        : [];

      const linkedDispatches = Array.from(dispatchMap.values()).sort((a, b) => {
        const timeDiff = new Date(b.dispatchDate).getTime() - new Date(a.dispatchDate).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

      return {
        ...serializeOrder(order),
        linkedInvoices,
        linkedDispatches
      };
    }),

  create: perm("orders:write")
    .input(
      z.object({
        outletId: z.string().uuid(),
        orderDate: z.string().datetime().optional(),
        deliveryAddress: z.string().min(1),
        priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        notes: z.string().nullable().optional(),
        lines: z.array(orderLineInputSchema).min(1)
      })
    )
    .output(orderSchema)
    .mutation(async ({ ctx, input }) => {
      const outlet = await ctx.prisma.outlet.findUnique({ where: { id: input.outletId } });
      if (!outlet) {
        throw apiError("BAD_REQUEST", "Invalid outletId");
      }
      if (!outlet.warehouseId) {
        throw apiError("BAD_REQUEST", "Outlet has no assigned warehouse");
      }

      const warehouse = await ctx.prisma.warehouse.findUnique({
        where: { id: outlet.warehouseId },
        select: { id: true, isActive: true }
      });
      if (!warehouse) {
        throw apiError("BAD_REQUEST", "Assigned warehouse not found");
      }
      if (!warehouse.isActive) {
        throw apiError("CONFLICT", "Assigned warehouse is inactive");
      }

      const productIds = [...new Set(input.lines.map((line) => line.productId))];
      const products = await ctx.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, sku: true }
      });
      if (products.length !== productIds.length) {
        throw apiError("BAD_REQUEST", "One or more productIds are invalid");
      }

      const skuByProductId = new Map(products.map((product) => [product.id, product.sku]));
      const now = new Date();

      const created = await ctx.prisma.$transaction(async (tx) => {
        const orderNumber = await nextOrderNumber(tx, now);

        const linesData = input.lines.map((line) => {
          const unitPrice = new Prisma.Decimal(line.unitPrice);
          const lineTotal = unitPrice.mul(line.qtyOrdered);
          return {
            productId: line.productId,
            sku: skuByProductId.get(line.productId) ?? "",
            qtyOrdered: line.qtyOrdered,
            qtyDispatched: 0,
            unitPrice,
            lineTotal,
            status: "pending" as const
          };
        });

        const totalValue = linesData.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));

        return tx.saleOrder.create({
          data: {
            orderNumber,
            outletId: input.outletId,
            createdById: ctx.actor.id,
            orderDate: input.orderDate ? new Date(input.orderDate) : now,
            deliveryAddress: input.deliveryAddress,
            status: "pending_approval",
            priority: input.priority,
            totalValue,
            notes: input.notes,
            lines: {
              create: linesData
            }
          },
          include: {
            lines: true
          }
        });
      });

      return serializeOrder(created);
    }),

  transition: perm("orders:manage")
    .input(
      z.object({
        id: z.string().uuid(),
        action: transitionActionSchema,
        note: z.string().nullable().optional()
      })
    )
    .output(orderSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.action === "approve" && !ctx.permissions.includes("*") && !ctx.permissions.includes("orders:approve")) {
        throw apiError("FORBIDDEN", "Requires: orders:approve");
      }

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const order = await tx.saleOrder.findUnique({
          where: { id: input.id },
          include: { lines: true }
        });

        if (!order) {
          throw apiError("NOT_FOUND", "Order not found");
        }

        const now = new Date();
        let data: Prisma.SaleOrderUncheckedUpdateInput;

        switch (input.action) {
          case "approve": {
            if (order.status !== "pending_approval" && order.status !== "on_hold") {
              throw apiError("CONFLICT", "Only pending_approval or on_hold orders can be approved");
            }
            data = {
              status: "approved",
              approvedById: ctx.actor.id,
              approvedAt: now,
              approvalNote: input.note,
              heldById: null,
              heldAt: null,
              holdNote: null,
              rejectionReason: null
            };
            break;
          }
          case "hold": {
            if (order.status !== "pending_approval") {
              throw apiError("CONFLICT", "Only pending_approval orders can be moved to on_hold");
            }
            data = {
              status: "on_hold",
              heldById: ctx.actor.id,
              heldAt: now,
              holdNote: input.note,
              approvedById: null,
              approvedAt: null,
              approvalNote: null,
              rejectionReason: null
            };
            break;
          }
          case "reject": {
            if (order.status !== "pending_approval" && order.status !== "on_hold") {
              throw apiError("CONFLICT", "Only pending_approval or on_hold orders can be rejected");
            }
            data = {
              status: "rejected",
              rejectionReason: input.note,
              approvedById: null,
              approvedAt: null,
              approvalNote: null
            };
            break;
          }
          case "cancel": {
            if (
              order.status === "fully_dispatched" ||
              order.status === "rejected" ||
              order.status === "cancelled"
            ) {
              throw apiError("CONFLICT", "Order cannot be cancelled from current state");
            }
            data = {
              status: "cancelled",
              notes: input.note ?? order.notes
            };
            break;
          }
          default: {
            throw apiError("BAD_REQUEST", "Unsupported transition action");
          }
        }

        const updatedOrder = await tx.saleOrder.update({
          where: { id: input.id },
          data,
          include: {
            lines: true
          }
        });

        if (input.action === "approve") {
          const existingInvoice = await tx.invoice.findUnique({
            where: { orderId: updatedOrder.id }
          });

          if (!existingInvoice) {
            const invoiceNumber = await nextInvoiceNumber(tx, now);
            await tx.invoice.create({
              data: {
                invoiceNumber,
                orderId: updatedOrder.id,
                outletId: updatedOrder.outletId,
                invoiceDate: now,
                subtotal: updatedOrder.totalValue,
                total: updatedOrder.totalValue,
                amountPaid: new Prisma.Decimal(0),
                amountDue: updatedOrder.totalValue,
                lines: {
                  create: updatedOrder.lines.map((line) => ({
                    productId: line.productId,
                    sku: line.sku,
                    qty: line.qtyOrdered,
                    unitPrice: line.unitPrice,
                    lineTotal: line.lineTotal
                  }))
                }
              }
            });

            const outstanding = await tx.invoice.aggregate({
              where: { outletId: updatedOrder.outletId },
              _sum: { amountDue: true }
            });

            await tx.outlet.update({
              where: { id: updatedOrder.outletId },
              data: {
                outstandingBalance: outstanding._sum.amountDue ?? new Prisma.Decimal(0)
              }
            });
          }
        }

        return updatedOrder;
      });

      return serializeOrder(updated);
    })
});
