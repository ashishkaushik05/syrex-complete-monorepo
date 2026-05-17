import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertOutletAccess, assertOutletWarehouseScope, findActorLinkedOutletId } from "./outlet-access";
import {
  orderDetailSchema,
  orderListFilterSchema,
  orderSchema,
  queryOrderDetail,
  queryOrderList,
  serializeOrder,
} from "./orders-shared";

const orderLineInputSchema = z.object({
  productId: z.string().uuid(),
  qtyOrdered: z.number().int().positive(),
  unitPrice: z.string().min(1),
});

const transitionActionSchema = z.enum(["approve", "hold", "reject", "cancel"]);

async function nextOrderNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const row = await tx.orderSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return `SO-${year}-${String(row.lastSequence).padStart(6, "0")}`;
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const row = await tx.invoiceSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return `INV-${year}-${String(row.lastSequence).padStart(6, "0")}`;
}

export const ordersRouter = createTRPCRouter({
  list: perm(P.orders.read)
    .input(orderListFilterSchema)
    .output(
      z.object({
        items: z.array(orderSchema),
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (
        input.mineOnly &&
        !ctx.permissions.includes(SUPER_ADMIN_PERMISSION) &&
        !ctx.permissions.includes(P.orders.write)
      ) {
        throw apiError(
          "FORBIDDEN",
          "mineOnly access requires sales order-write permission",
        );
      }
      const linkedOutletId = await findActorLinkedOutletId(ctx);
      return queryOrderList(ctx, input, {
        forcedOutletId: linkedOutletId ?? undefined,
      });
    }),

  getById: perm(P.orders.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(orderDetailSchema)
    .query(async ({ ctx, input }) => {
      const detail = await queryOrderDetail(ctx, input.id);
      const linkedOutletId = await findActorLinkedOutletId(ctx);
      if (linkedOutletId) {
        await assertOutletAccess(ctx, detail.outletId);
      }
      await assertOutletWarehouseScope(ctx, detail.outletId);
      return detail;
    }),

  create: perm(P.orders.write)
    .input(
      z.object({
        outletId: z.string().uuid(),
        orderDate: z.string().datetime().optional(),
        deliveryAddress: z.string().min(1),
        priority: z
          .enum(["low", "medium", "high", "critical"])
          .default("medium"),
        notes: z.string().nullable().optional(),
        lines: z.array(orderLineInputSchema).min(1),
      }),
    )
    .output(orderSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);

      const outlet = await ctx.prisma.outlet.findUnique({
        where: { id: input.outletId },
      });
      if (!outlet) {
        throw apiError("BAD_REQUEST", "Invalid outletId");
      }
      if (!outlet.warehouseId) {
        throw apiError("BAD_REQUEST", "Outlet has no assigned warehouse");
      }

      const warehouse = await ctx.prisma.warehouse.findUnique({
        where: { id: outlet.warehouseId },
        select: { id: true, isActive: true },
      });
      if (!warehouse) {
        throw apiError("BAD_REQUEST", "Assigned warehouse not found");
      }
      if (!warehouse.isActive) {
        throw apiError("CONFLICT", "Assigned warehouse is inactive");
      }

      const productIds = [
        ...new Set(input.lines.map((line) => line.productId)),
      ];
      const products = await ctx.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, sku: true },
      });
      if (products.length !== productIds.length) {
        throw apiError("BAD_REQUEST", "One or more productIds are invalid");
      }

      const skuByProductId = new Map(
        products.map((product) => [product.id, product.sku]),
      );
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
            status: "pending" as const,
          };
        });

        const totalValue = linesData.reduce(
          (sum, line) => sum.add(line.lineTotal),
          new Prisma.Decimal(0),
        );

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
              create: linesData,
            },
          },
          include: {
            lines: true,
          },
        });
      });

      return serializeOrder(created);
    }),

  transition: perm(P.orders.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        action: transitionActionSchema,
        note: z.string().nullable().optional(),
      }),
    )
    .output(orderSchema)
    .mutation(async ({ ctx, input }) => {
      if (
        input.action === "approve" &&
        !ctx.permissions.includes(SUPER_ADMIN_PERMISSION) &&
        !ctx.permissions.includes(P.orders.approve)
      ) {
        throw apiError("FORBIDDEN", "Requires: orders:approve");
      }

      const preCheck = await ctx.prisma.saleOrder.findUnique({
        where: { id: input.id },
        select: { outletId: true }
      });
      if (!preCheck) throw apiError("NOT_FOUND", "Order not found");

      const linkedOutletId = await findActorLinkedOutletId(ctx);
      if (linkedOutletId) {
        await assertOutletAccess(ctx, preCheck.outletId);
      }
      await assertOutletWarehouseScope(ctx, preCheck.outletId);

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const order = await tx.saleOrder.findUnique({
          where: { id: input.id },
          include: { lines: true },
        });

        if (!order) {
          throw apiError("NOT_FOUND", "Order not found");
        }

        const now = new Date();
        let data: Prisma.SaleOrderUncheckedUpdateInput;

        switch (input.action) {
          case "approve": {
            if (
              order.status !== "pending_approval" &&
              order.status !== "on_hold"
            ) {
              throw apiError(
                "CONFLICT",
                "Only pending_approval or on_hold orders can be approved",
              );
            }
            data = {
              status: "approved",
              approvedById: ctx.actor.id,
              approvedAt: now,
              approvalNote: input.note,
              heldById: null,
              heldAt: null,
              holdNote: null,
              rejectionReason: null,
            };
            break;
          }
          case "hold": {
            if (order.status !== "pending_approval") {
              throw apiError(
                "CONFLICT",
                "Only pending_approval orders can be moved to on_hold",
              );
            }
            data = {
              status: "on_hold",
              heldById: ctx.actor.id,
              heldAt: now,
              holdNote: input.note,
              approvedById: null,
              approvedAt: null,
              approvalNote: null,
              rejectionReason: null,
            };
            break;
          }
          case "reject": {
            if (
              order.status !== "pending_approval" &&
              order.status !== "on_hold"
            ) {
              throw apiError(
                "CONFLICT",
                "Only pending_approval or on_hold orders can be rejected",
              );
            }
            data = {
              status: "rejected",
              rejectionReason: input.note,
              approvedById: null,
              approvedAt: null,
              approvalNote: null,
            };
            break;
          }
          case "cancel": {
            if (
              order.status === "fully_dispatched" ||
              order.status === "rejected" ||
              order.status === "cancelled"
            ) {
              throw apiError(
                "CONFLICT",
                "Order cannot be cancelled from current state",
              );
            }
            data = {
              status: "cancelled",
              notes: input.note ?? order.notes,
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
            lines: true,
          },
        });

        if (
          input.action === "approve" &&
          !updatedOrder.suppressAutoInvoice &&
          updatedOrder.orderType !== "warranty_replacement"
        ) {
          const existingInvoice = await tx.invoice.findUnique({
            where: { orderId: updatedOrder.id },
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
                    lineTotal: line.lineTotal,
                  })),
                },
              },
            });

            const outstanding = await tx.invoice.aggregate({
              where: { outletId: updatedOrder.outletId },
              _sum: { amountDue: true },
            });

            await tx.outlet.update({
              where: { id: updatedOrder.outletId },
              data: {
                outstandingBalance:
                  outstanding._sum.amountDue ?? new Prisma.Decimal(0),
              },
            });
          }
        }

        return updatedOrder;
      });

      return serializeOrder(updated);
    }),
});
