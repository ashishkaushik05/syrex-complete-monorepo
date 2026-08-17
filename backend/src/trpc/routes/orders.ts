import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertOutletAccess, assertOutletWarehouseScope, findActorLinkedOutletId } from "./outlet-access";
import {
  ChargeDefinition,
  computeChargeRows,
  computeDiscountAmount,
  createAutoInvoice,
  nextOrderNumber,
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
      const linkedOutletId = findActorLinkedOutletId(ctx);
      return queryOrderList(ctx, input, {
        forcedOutletId: linkedOutletId ?? undefined,
      });
    }),

  getById: perm(P.orders.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(orderDetailSchema)
    .query(async ({ ctx, input }) => {
      const detail = await queryOrderDetail(ctx, input.id);
      const linkedOutletId = findActorLinkedOutletId(ctx);
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
        discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
        discountRate: z.string().optional(),
        paymentTermsDays: z.number().int().min(0).max(365).default(30),
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
      if (!outlet.isActive) {
        throw apiError("CONFLICT", "Outlet is inactive");
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

        let discountRate = new Prisma.Decimal(0);
        if (input.discountRate) {
          discountRate = new Prisma.Decimal(input.discountRate);
          if (discountRate.lt(0)) {
            throw apiError("BAD_REQUEST", "Discount rate must be non-negative");
          }
          if (input.discountType === "percentage" && discountRate.gt(100)) {
            throw apiError("BAD_REQUEST", "Percentage discount cannot exceed 100");
          }
        }

        const linesData = input.lines.map((line) => {
          const unitPrice = new Prisma.Decimal(line.unitPrice);
          if (unitPrice.lt(0)) {
            throw apiError("BAD_REQUEST", "Unit price must be non-negative");
          }
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
        const discountAmount = computeDiscountAmount(totalValue, input.discountType ?? null, discountRate);
        const taxableValue = Prisma.Decimal.max(new Prisma.Decimal(0), totalValue.sub(discountAmount));

        const activeCharges = await tx.taxCharge.findMany({
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        });
        const chargeDefs: ChargeDefinition[] = activeCharges.map((c) => ({
          taxChargeId: c.id,
          name: c.name,
          type: c.type,
          rate: c.rate,
          displayOrder: c.displayOrder,
        }));
        const estimatedCharges = computeChargeRows(taxableValue, chargeDefs);
        const taxTotal = estimatedCharges.reduce(
          (sum, c) => sum.add(c.amount),
          new Prisma.Decimal(0),
        );
        const grandTotal = taxableValue.add(taxTotal);
        const taxSnapshot = chargeDefs.map((c) => ({
          taxChargeId: c.taxChargeId,
          name: c.name,
          type: c.type,
          rate: c.rate.toFixed(2),
          displayOrder: c.displayOrder,
        }));

        return tx.saleOrder.create({
          data: {
            orderNumber,
            outletId: input.outletId,
            createdById: ctx.actor.id,
            orderDate: input.orderDate ? new Date(input.orderDate) : now,
            deliveryAddress: input.deliveryAddress,
            status: "pending_approval",
            priority: input.priority,
            subtotalValue: totalValue,
            discountType: input.discountType ?? null,
            discountRate,
            discountAmount,
            taxableValue,
            taxSnapshot,
            taxTotal,
            paymentTermsDays: input.paymentTermsDays,
            totalValue: grandTotal,
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

      const linkedOutletId = findActorLinkedOutletId(ctx);
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

        if (input.action === "approve") {
          await createAutoInvoice(tx, updatedOrder, now);
        }

        return updatedOrder;
      });

      return serializeOrder(updated);
    }),
});
