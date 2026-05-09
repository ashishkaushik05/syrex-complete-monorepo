import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

function isAdmin(ctx: { permissions: string[] }) {
  return ctx.permissions.includes("*");
}

const deliveryStatusSchema = z.enum(["created", "in_transit", "delivered"]);

const dispatchLineSchema = z.object({
  id: z.string(),
  orderLineId: z.string(),
  orderId: z.string(),
  productId: z.string(),
  sku: z.string(),
  qtyDispatched: z.number().int(),
  serialNumbers: z.array(z.string())
});

const dispatchSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  transporterName: z.string(),
  vehicleNumber: z.string(),
  lrNumber: z.string().nullable(),
  dispatchDate: z.string(),
  estimatedDelivery: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  deliveryStatus: deliveryStatusSchema,
  createdById: z.string(),
  createdAt: z.string(),
  lines: z.array(dispatchLineSchema)
});

const createDispatchInputSchema = z.object({
  warehouseId: z.string().uuid(),
  transporterName: z.string().min(1),
  vehicleNumber: z.string().min(1),
  lrNumber: z.string().nullable().optional(),
  dispatchDate: z.string().datetime().optional(),
  estimatedDelivery: z.string().datetime().nullable().optional(),
  idempotencyKey: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        orderLineId: z.string().uuid(),
        qtyDispatched: z.number().int().positive(),
        serialNumbers: z.array(z.string()).optional()
      })
    )
    .min(1)
});

function toLineStatus(qtyOrdered: number, qtyDispatched: number) {
  if (qtyDispatched <= 0) {
    return "pending" as const;
  }
  if (qtyDispatched >= qtyOrdered) {
    return "fully_dispatched" as const;
  }
  return "partially_dispatched" as const;
}

function deriveOrderDispatchStatus(order: {
  status: OrderStatus;
  lines: Array<{ qtyOrdered: number; qtyDispatched: number }>;
}) {
  if (order.status !== "approved" && order.status !== "partially_dispatched") {
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

function parseSerialNumbers(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeDeliveryStatus(value: string): z.infer<typeof deliveryStatusSchema> {
  if (value === "created" || value === "in_transit" || value === "delivered") {
    return value;
  }
  return "created";
}

function toDispatchItem(dispatch: {
  id: string;
  warehouseId: string;
  transporterName: string;
  vehicleNumber: string;
  lrNumber: string | null;
  dispatchDate: Date;
  estimatedDelivery: Date | null;
  deliveredAt: Date | null;
  deliveryStatus: string;
  createdById: string;
  createdAt: Date;
  lines: Array<{
    id: string;
    orderLineId: string;
    productId: string;
    sku: string;
    qtyDispatched: number;
    serialNumbers: Prisma.JsonValue;
    orderLine: { orderId: string };
  }>;
}) {
  return {
    id: dispatch.id,
    warehouseId: dispatch.warehouseId,
    transporterName: dispatch.transporterName,
    vehicleNumber: dispatch.vehicleNumber,
    lrNumber: dispatch.lrNumber,
    dispatchDate: dispatch.dispatchDate.toISOString(),
    estimatedDelivery: dispatch.estimatedDelivery?.toISOString() ?? null,
    deliveredAt: dispatch.deliveredAt?.toISOString() ?? null,
    deliveryStatus: normalizeDeliveryStatus(dispatch.deliveryStatus),
    createdById: dispatch.createdById,
    createdAt: dispatch.createdAt.toISOString(),
    lines: dispatch.lines.map((line) => ({
      id: line.id,
      orderLineId: line.orderLineId,
      orderId: line.orderLine.orderId,
      productId: line.productId,
      sku: line.sku,
      qtyDispatched: line.qtyDispatched,
      serialNumbers: parseSerialNumbers(line.serialNumbers)
    }))
  };
}

export const dispatchesRouter = createTRPCRouter({
  
  list: perm("dispatches:read")
    .input(
      paginationInputSchema.extend({
        warehouseId: z.string().uuid().optional(),
        deliveryStatus: deliveryStatusSchema.optional()
      })
    )
    .output(z.object({ items: z.array(dispatchSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const effectiveWarehouseId = isAdmin(ctx) ? input.warehouseId : ctx.managedWarehouseId ?? undefined;
      const rows = await ctx.prisma.dispatch.findMany({
        where: {
          warehouseId: effectiveWarehouseId,
          deliveryStatus: input.deliveryStatus
        },
        include: {
          lines: {
            include: {
              orderLine: {
                select: {
                  orderId: true
                }
              }
            }
          }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items: pageItems.map(toDispatchItem),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm("dispatches:read")
    .input(z.object({ id: z.string().uuid() }))
    .output(dispatchSchema)
    .query(async ({ ctx, input }) => {
      const dispatch = await ctx.prisma.dispatch.findUnique({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              orderLine: {
                select: {
                  orderId: true
                }
              }
            }
          }
        }
      });

      if (!dispatch) {
        throw apiError("NOT_FOUND", "Dispatch not found");
      }

      return toDispatchItem(dispatch);
    }),

  create: perm("dispatches:write")
    .input(createDispatchInputSchema)
    .output(dispatchSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;

      if (!isAdmin(ctx)) {
        if (!ctx.managedWarehouseId) {
          throw apiError("FORBIDDEN", "No warehouse assigned to your account");
        }
        if (input.warehouseId !== ctx.managedWarehouseId) {
          throw apiError("FORBIDDEN", "You can only dispatch from your assigned warehouse");
        }
      }

      if (input.idempotencyKey) {
        const existing = await ctx.prisma.dispatch.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { lines: { include: { orderLine: { select: { orderId: true } } } } }
        });
        if (existing) return toDispatchItem(existing);
      }

      const createdId = await ctx.prisma.$transaction(async (tx) => {
        const validatedLines: Array<{
          orderLineId: string;
          orderId: string;
          productId: string;
          sku: string;
          qtyOrdered: number;
          qtyDispatchedBefore: number;
          qtyDispatchedNow: number;
        }> = [];

        for (const requested of input.lines) {
          const line = await tx.saleOrderLine.findUnique({
            where: {
              id: requested.orderLineId
            },
            include: {
              order: {
                select: {
                  id: true,
                  status: true
                }
              }
            }
          });
          if (!line) {
            throw apiError("BAD_REQUEST", "One or more orderLineIds are invalid");
          }
          if (line.order.status !== "approved" && line.order.status !== "partially_dispatched") {
            throw apiError("CONFLICT", "Dispatch can be created only for approved orders");
          }

          const remaining = line.qtyOrdered - line.qtyDispatched;
          if (requested.qtyDispatched > remaining) {
            throw apiError("CONFLICT", "Dispatch quantity exceeds remaining order quantity");
          }

          const stockUpdate = await tx.warehouseStock.updateMany({
            where: {
              warehouseId: input.warehouseId,
              productId: line.productId,
              currentQty: { gte: requested.qtyDispatched }
            },
            data: {
              currentQty: { decrement: requested.qtyDispatched }
            }
          });
          if (stockUpdate.count !== 1) {
            throw apiError("CONFLICT", `Insufficient stock for product ${line.sku}`);
          }

          const newQtyDispatched = line.qtyDispatched + requested.qtyDispatched;
          const lineUpdate = await tx.saleOrderLine.updateMany({
            where: {
              id: line.id,
              qtyDispatched: line.qtyDispatched
            },
            data: {
              qtyDispatched: newQtyDispatched,
              status: toLineStatus(line.qtyOrdered, newQtyDispatched)
            }
          });
          if (lineUpdate.count !== 1) {
            throw apiError("CONFLICT", "Order line was modified by another request. Retry dispatch.");
          }

          validatedLines.push({
            orderLineId: line.id,
            orderId: line.orderId,
            productId: line.productId,
            sku: line.sku,
            qtyOrdered: line.qtyOrdered,
            qtyDispatchedBefore: line.qtyDispatched,
            qtyDispatchedNow: newQtyDispatched
          });
        }

        const dispatch = await tx.dispatch.create({
          data: {
            warehouseId: input.warehouseId,
            transporterName: input.transporterName,
            vehicleNumber: input.vehicleNumber,
            lrNumber: input.lrNumber ?? undefined,
            dispatchDate: input.dispatchDate ? new Date(input.dispatchDate) : undefined,
            estimatedDelivery: input.estimatedDelivery ? new Date(input.estimatedDelivery) : null,
            deliveryStatus: "created",
            idempotencyKey: input.idempotencyKey,
            createdById: actorId,
            lines: {
              create: input.lines.map((line, index) => {
                const validated = validatedLines[index];
                return {
                  orderLineId: validated.orderLineId,
                  productId: validated.productId,
                  sku: validated.sku,
                  qtyDispatched: line.qtyDispatched,
                  serialNumbers: line.serialNumbers ?? []
                };
              })
            }
          },
          include: {
            lines: {
              include: {
                orderLine: {
                  select: {
                    orderId: true
                  }
                }
              }
            }
          }
        });

        const touchedOrderIds = [...new Set(validatedLines.map((line) => line.orderId))];
        for (const orderId of touchedOrderIds) {
          const order = await tx.saleOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { lines: true }
          });
          const status = deriveOrderDispatchStatus(order);
          if (status !== order.status) {
            await tx.saleOrder.update({
              where: { id: order.id },
              data: { status }
            });
          }
        }

        return dispatch.id;
      });

      const created = await ctx.prisma.dispatch.findUniqueOrThrow({
        where: { id: createdId },
        include: {
          lines: {
            include: {
              orderLine: {
                select: {
                  orderId: true
                }
              }
            }
          }
        }
      });

      return toDispatchItem(created);
    }),

  markDelivered: perm("dispatches:deliver")
    .input(
      z.object({
        id: z.string().uuid(),
        deliveredAt: z.string().datetime().optional()
      })
    )
    .output(dispatchSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.dispatch.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Dispatch not found");
      }
      if (!isAdmin(ctx) && existing.warehouseId !== ctx.managedWarehouseId) {
        throw apiError("FORBIDDEN", "You can only mark deliveries for your assigned warehouse");
      }
      if (existing.deliveryStatus === "delivered") {
        throw apiError("CONFLICT", "Dispatch is already delivered");
      }

      const updated = await ctx.prisma.dispatch.update({
        where: { id: input.id },
        data: {
          deliveryStatus: "delivered",
          deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : new Date()
        },
        include: {
          lines: {
            include: {
              orderLine: {
                select: {
                  orderId: true
                }
              }
            }
          }
        }
      });

      return toDispatchItem(updated);
    })
});
