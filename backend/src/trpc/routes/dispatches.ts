import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { actorHasInternalSalesOutletAccess, findActorLinkedOutletId } from "./outlet-access";
import { normalizeSerial, recordComplaintActivity } from "./service-shared";

function isAdmin(ctx: { permissions: string[] }) {
  return ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
}

function deriveActorRole(ctx: {
  permissions: string[];
  managedWarehouseId: string | null | undefined;
}): "admin" | "warehouse" | "outlet" {
  if (ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) return "admin";
  if (ctx.managedWarehouseId) return "warehouse";
  return "outlet";
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

const timelineEventSchema = z.object({
  id: z.string(),
  dispatchId: z.string(),
  status: deliveryStatusSchema,
  actorId: z.string().nullable(),
  actorRole: z.string().nullable(),
  note: z.string().nullable(),
  happenedAt: z.string()
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
    orderLine: { orderId?: string; order?: { id: string } };
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
      orderId: line.orderLine.orderId ?? line.orderLine.order?.id ?? "",
      productId: line.productId,
      sku: line.sku,
      qtyDispatched: line.qtyDispatched,
      serialNumbers: parseSerialNumbers(line.serialNumbers)
    }))
  };
}

const dispatchLinesInclude = {
  lines: {
    include: {
      orderLine: {
        select: { orderId: true }
      }
    }
  }
} as const;

export const dispatchesRouter = createTRPCRouter({

  list: perm(P.dispatches.read)
    .input(
      paginationInputSchema.extend({
        warehouseId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        deliveryStatus: deliveryStatusSchema.optional()
      })
    )
    .output(z.object({ items: z.array(dispatchSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const linkedOutletId = await findActorLinkedOutletId(ctx);
      const admin = isAdmin(ctx);
      const hasInternalSalesAccess = await actorHasInternalSalesOutletAccess(ctx);
      const hasGlobalDispatchAccess = admin || hasInternalSalesAccess;
      const warehouseScoped = !hasGlobalDispatchAccess && !linkedOutletId && !!ctx.managedWarehouseId;
      if (!hasGlobalDispatchAccess && !linkedOutletId && !warehouseScoped) {
        throw apiError("FORBIDDEN", "No safe dispatch scope available");
      }

      const offset = decodeCursor(input.cursor) ?? 0;
      const dispatchAndClauses: Prisma.DispatchWhereInput[] = [];
      if (input.orderId) {
        dispatchAndClauses.push({
          lines: { some: { orderLine: { orderId: input.orderId } } },
        });
      }
      if (linkedOutletId && !hasGlobalDispatchAccess) {
        dispatchAndClauses.push({
          lines: { some: { orderLine: { order: { outletId: linkedOutletId } } } },
        });
      }
      const rows = await ctx.prisma.dispatch.findMany({
        where: {
          warehouseId: hasGlobalDispatchAccess ? input.warehouseId : (ctx.managedWarehouseId ?? undefined),
          deliveryStatus: input.deliveryStatus,
          AND: dispatchAndClauses.length ? dispatchAndClauses : undefined,
        },
        include: {
          lines: {
            include: {
              orderLine: {
                include: {
                  order: {
                    select: {
                      id: true,
                      orderType: true,
                      sourceComplaintId: true
                    }
                  }
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

  getById: perm(P.dispatches.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(dispatchSchema)
    .query(async ({ ctx, input }) => {
      const linkedOutletId = await findActorLinkedOutletId(ctx);
      const admin = isAdmin(ctx);
      const hasInternalSalesAccess = await actorHasInternalSalesOutletAccess(ctx);
      const hasGlobalDispatchAccess = admin || hasInternalSalesAccess;
      const warehouseScoped = !hasGlobalDispatchAccess && !linkedOutletId && !!ctx.managedWarehouseId;
      if (!hasGlobalDispatchAccess && !linkedOutletId && !warehouseScoped) {
        throw apiError("FORBIDDEN", "No safe dispatch scope available");
      }

      const dispatch = await ctx.prisma.dispatch.findFirst({
        where: {
          id: input.id,
          ...(linkedOutletId && !hasGlobalDispatchAccess
            ? {
                lines: {
                  some: {
                    orderLine: { order: { outletId: linkedOutletId } },
                  },
                },
              }
            : {}),
          ...(!hasGlobalDispatchAccess && !linkedOutletId && ctx.managedWarehouseId
            ? { warehouseId: ctx.managedWarehouseId }
            : {}),
        },
        include: {
          lines: {
            include: {
              orderLine: {
                select: { orderId: true }
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

  timeline: perm(P.dispatches.read)
    .input(z.object({ dispatchId: z.string().uuid() }))
    .output(z.array(timelineEventSchema))
    .query(async ({ ctx, input }) => {
      const linkedOutletId = await findActorLinkedOutletId(ctx);
      const admin = isAdmin(ctx);
      const hasInternalSalesAccess = await actorHasInternalSalesOutletAccess(ctx);
      const hasGlobalDispatchAccess = admin || hasInternalSalesAccess;
      const warehouseScoped = !hasGlobalDispatchAccess && !linkedOutletId && !!ctx.managedWarehouseId;
      if (!hasGlobalDispatchAccess && !linkedOutletId && !warehouseScoped) {
        throw apiError("FORBIDDEN", "No safe dispatch scope available");
      }

      const dispatch = await ctx.prisma.dispatch.findFirst({
        where: {
          id: input.dispatchId,
          ...(linkedOutletId && !hasGlobalDispatchAccess
            ? {
                lines: {
                  some: {
                    orderLine: { order: { outletId: linkedOutletId } },
                  },
                },
              }
            : {}),
          ...(!hasGlobalDispatchAccess && !linkedOutletId && ctx.managedWarehouseId
            ? { warehouseId: ctx.managedWarehouseId }
            : {}),
        },
        select: { warehouseId: true }
      });
      if (!dispatch) {
        throw apiError("NOT_FOUND", "Dispatch not found");
      }

      const events = await ctx.prisma.dispatchTimeline.findMany({
        where: { dispatchId: input.dispatchId },
        orderBy: { happenedAt: "asc" }
      });

      return events.map((e) => ({
        id: e.id,
        dispatchId: e.dispatchId,
        status: normalizeDeliveryStatus(e.status) as z.infer<typeof deliveryStatusSchema>,
        actorId: e.actorId,
        actorRole: e.actorRole,
        note: e.note,
        happenedAt: e.happenedAt.toISOString()
      }));
    }),

  create: perm(P.dispatches.write)
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

      const actorRole = deriveActorRole(ctx);

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
            where: { id: requested.orderLineId },
            include: {
              order: {
                select: { id: true, status: true }
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
            data: { currentQty: { decrement: requested.qtyDispatched } }
          });
          if (stockUpdate.count !== 1) {
            throw apiError("CONFLICT", `Insufficient stock for product ${line.sku}`);
          }

          const newQtyDispatched = line.qtyDispatched + requested.qtyDispatched;
          const lineUpdate = await tx.saleOrderLine.updateMany({
            where: { id: line.id, qtyDispatched: line.qtyDispatched },
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
              include: { orderLine: { select: { orderId: true } } }
            }
          }
        });

        const orderLineSerials = new Map(
          input.lines.map((l) => [l.orderLineId, l.serialNumbers ?? []])
        );
        const serialsToCreate: Array<{ dispatchLineId: string; normalizedSerial: string }> = [];
        for (const line of dispatch.lines) {
          for (const serial of orderLineSerials.get(line.orderLineId) ?? []) {
            const ns = normalizeSerial(serial);
            if (ns) serialsToCreate.push({ dispatchLineId: line.id, normalizedSerial: ns });
          }
        }
        if (serialsToCreate.length > 0) {
          await tx.dispatchLineSerial.createMany({ data: serialsToCreate, skipDuplicates: true });
        }

        const touchedOrderIds = [...new Set(validatedLines.map((line) => line.orderId))];
        for (const orderId of touchedOrderIds) {
          const order = await tx.saleOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { lines: true }
          });
          const status = deriveOrderDispatchStatus(order);
          if (status !== order.status) {
            await tx.saleOrder.update({ where: { id: order.id }, data: { status } });
          }
        }

        await tx.dispatchTimeline.create({
          data: {
            dispatchId: dispatch.id,
            status: "created",
            actorId,
            actorRole
          }
        });

        return dispatch.id;
      });

      const created = await ctx.prisma.dispatch.findUniqueOrThrow({
        where: { id: createdId },
        include: dispatchLinesInclude
      });

      return toDispatchItem(created);
    }),

  markInTransit: perm(P.dispatches.write)
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().optional()
    }))
    .output(dispatchSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;

      const existing = await ctx.prisma.dispatch.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Dispatch not found");
      }
      if (!isAdmin(ctx) && existing.warehouseId !== ctx.managedWarehouseId) {
        throw apiError("FORBIDDEN", "You can only update dispatches for your assigned warehouse");
      }
      if (existing.deliveryStatus !== "created") {
        throw apiError("CONFLICT", "Only dispatches in 'created' status can be marked in transit");
      }

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const dispatch = await tx.dispatch.update({
          where: { id: input.id },
          data: { deliveryStatus: "in_transit" },
          include: dispatchLinesInclude
        });

        await tx.dispatchTimeline.create({
          data: {
            dispatchId: dispatch.id,
            status: "in_transit",
            actorId,
            actorRole: "warehouse",
            note: input.note
          }
        });

        return dispatch;
      });

      return toDispatchItem(updated);
    }),

  markDelivered: perm(P.dispatches.deliver)
    .input(z.object({
      id: z.string().uuid(),
      deliveredAt: z.string().datetime().optional(),
      note: z.string().optional()
    }))
    .output(dispatchSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;

      const existing = await ctx.prisma.dispatch.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Dispatch not found");
      }
      if (existing.deliveryStatus === "delivered") {
        throw apiError("CONFLICT", "Dispatch is already delivered");
      }

      const linkedOutletId = await findActorLinkedOutletId(ctx);

      if (linkedOutletId) {
        // Outlet user — must own at least one order in this dispatch
        const match = await ctx.prisma.dispatchLine.findFirst({
          where: {
            dispatchId: existing.id,
            orderLine: { order: { outletId: linkedOutletId } }
          }
        });
        if (!match) {
          throw apiError("FORBIDDEN", "This dispatch does not belong to your outlet");
        }
      } else if (!isAdmin(ctx) && existing.warehouseId !== ctx.managedWarehouseId) {
        throw apiError("FORBIDDEN", "You can only mark deliveries for your assigned warehouse");
      }

      const actorRole = linkedOutletId ? "outlet" : deriveActorRole(ctx);
      const deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : new Date();

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const dispatch = await tx.dispatch.update({
          where: { id: input.id },
          data: { deliveryStatus: "delivered", deliveredAt },
          include: {
            lines: {
              include: {
                orderLine: {
                  include: {
                    order: {
                      select: { id: true, orderType: true, sourceComplaintId: true }
                    }
                  }
                }
              }
            }
          }
        });

        await tx.dispatchTimeline.create({
          data: {
            dispatchId: dispatch.id,
            status: "delivered",
            actorId,
            actorRole,
            note: input.note,
            happenedAt: deliveredAt
          }
        });

        return dispatch;
      });

      // Auto-resolve warranty replacement complaints
      const complaintIds = Array.from(
        new Set(
          updated.lines
            .map((line) => line.orderLine.order)
            .filter((order) => order.orderType === "warranty_replacement" && order.sourceComplaintId)
            .map((order) => order.sourceComplaintId!)
        )
      );

      if (complaintIds.length > 0) {
        await ctx.prisma.$transaction(async (tx) => {
          const complaints = await tx.serviceComplaint.findMany({
            where: { id: { in: complaintIds } },
            select: { id: true, status: true }
          });

          for (const complaint of complaints) {
            if (
              complaint.status === "resolved" ||
              complaint.status === "telephonic_closure" ||
              complaint.status === "cancelled"
            ) {
              continue;
            }

            await tx.serviceComplaint.update({
              where: { id: complaint.id },
              data: {
                status: "resolved",
                closedAt: new Date(),
                resolutionNote: "Auto-resolved after replacement dispatch delivery"
              }
            });

            await recordComplaintActivity(tx, {
              complaintId: complaint.id,
              actorId,
              action: "replacement_delivered",
              fromStatus: complaint.status,
              toStatus: "resolved",
              note: `Resolved on dispatch delivery ${updated.id}`
            });

            const replacementLines = await tx.serviceComplaintLine.findMany({
              where: {
                complaintId: complaint.id,
                normalizedReplacementSerial: { not: null }
              },
              select: { normalizedReplacementSerial: true }
            });

            if (replacementLines.length > 0) {
              await tx.serviceSerialEvent.createMany({
                data: replacementLines.map((line) => ({
                  normalizedSerial: line.normalizedReplacementSerial!,
                  eventType: "replacement_delivered",
                  entityType: "dispatch",
                  entityId: updated.id,
                  eventAt: deliveredAt
                }))
              });
            }
          }
        });
      }

      return toDispatchItem(updated);
    })
});
