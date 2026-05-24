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

type ChargeType = "percentage" | "fixed";

type ChargeDefinition = {
  taxChargeId: string | null;
  name: string;
  type: ChargeType;
  rate: Prisma.Decimal;
  displayOrder: number;
};

function parseDecimal(value: unknown): Prisma.Decimal | null {
  try {
    if (typeof value === "string" || typeof value === "number") {
      return new Prisma.Decimal(value);
    }
    return null;
  } catch {
    return null;
  }
}

function computeDiscountAmount(
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

function computeChargeRows(
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

function parseChargeSnapshot(snapshot: Prisma.JsonValue | null): ChargeDefinition[] {
  if (!snapshot || !Array.isArray(snapshot)) return [];
  const rows: ChargeDefinition[] = [];
  for (const item of snapshot) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const type = row.type === "percentage" || row.type === "fixed" ? row.type : null;
    const name = typeof row.name === "string" ? row.name : null;
    const displayOrder = typeof row.displayOrder === "number" && Number.isInteger(row.displayOrder)
      ? row.displayOrder
      : null;
    const rate = parseDecimal(row.rate);
    if (!type || !name || displayOrder === null || !rate) continue;
    const taxChargeId = typeof row.taxChargeId === "string" ? row.taxChargeId : null;
    rows.push({
      taxChargeId,
      name,
      type,
      rate,
      displayOrder,
    });
  }
  return rows.sort((a, b) => a.displayOrder - b.displayOrder);
}

async function nextOrderNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const prefix = `SO-${year}-`;
  const row = await tx.orderSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  let sequence = row.lastSequence;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const orderNumber = `${prefix}${String(sequence).padStart(6, "0")}`;
    const existing = await tx.saleOrder.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    if (!existing) {
      return orderNumber;
    }

    const existingOrders = await tx.saleOrder.findMany({
      where: { orderNumber: { startsWith: prefix } },
      select: { orderNumber: true },
    });
    const maxExistingSequence = existingOrders.reduce((max, order) => {
      const suffix = order.orderNumber.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) {
        return max;
      }
      return Math.max(max, Number.parseInt(suffix, 10));
    }, sequence);

    sequence = maxExistingSequence + 1;
    await tx.orderSequence.update({
      where: { year },
      data: { lastSequence: sequence },
    });
  }

  throw apiError("CONFLICT", "Could not allocate a unique order number");
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const prefix = `INV-${year}-`;
  const row = await tx.invoiceSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  let sequence = row.lastSequence;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const invoiceNumber = `${prefix}${String(sequence).padStart(6, "0")}`;
    const existing = await tx.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    });
    if (!existing) {
      return invoiceNumber;
    }

    const existingInvoices = await tx.invoice.findMany({
      where: { invoiceNumber: { startsWith: prefix } },
      select: { invoiceNumber: true },
    });
    const maxExistingSequence = existingInvoices.reduce((max, invoice) => {
      const suffix = invoice.invoiceNumber.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) {
        return max;
      }
      return Math.max(max, Number.parseInt(suffix, 10));
    }, sequence);

    sequence = maxExistingSequence + 1;
    await tx.invoiceSequence.update({
      where: { year },
      data: { lastSequence: sequence },
    });
  }

  throw apiError("CONFLICT", "Could not allocate a unique invoice number");
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
            const lineSubtotal = updatedOrder.lines.reduce(
              (sum, line) => sum.add(line.lineTotal),
              new Prisma.Decimal(0),
            );
            const subtotal = updatedOrder.subtotalValue.gt(0) || lineSubtotal.eq(0)
              ? updatedOrder.subtotalValue
              : lineSubtotal;
            const discountRate = updatedOrder.discountRate;
            const discountType = updatedOrder.discountType;
            const discountAmount = computeDiscountAmount(subtotal, discountType, discountRate);
            const taxableSubtotal = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.sub(discountAmount));

            let chargeDefs = parseChargeSnapshot(updatedOrder.taxSnapshot);
            if (chargeDefs.length === 0) {
              const activeCharges = await tx.taxCharge.findMany({
                where: { isActive: true },
                orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
              });
              chargeDefs = activeCharges.map((c) => ({
                taxChargeId: c.id,
                name: c.name,
                type: c.type,
                rate: c.rate,
                displayOrder: c.displayOrder,
              }));
            }
            const chargesData = computeChargeRows(taxableSubtotal, chargeDefs);
            const chargesTotal = chargesData.reduce(
              (sum, c) => sum.add(c.amount),
              new Prisma.Decimal(0)
            );
            const total = taxableSubtotal.add(chargesTotal);
            const dueDate = new Date(now);
            dueDate.setUTCDate(dueDate.getUTCDate() + updatedOrder.paymentTermsDays);
            const taxSnapshot = chargeDefs.map((c) => ({
              taxChargeId: c.taxChargeId,
              name: c.name,
              type: c.type,
              rate: c.rate.toFixed(2),
              displayOrder: c.displayOrder,
            }));

            await tx.invoice.create({
              data: {
                invoiceNumber,
                orderId: updatedOrder.id,
                outletId: updatedOrder.outletId,
                invoiceDate: now,
                dueDate,
                subtotal,
                discountType,
                discountRate,
                discountAmount,
                taxSnapshot,
                total,
                amountPaid: new Prisma.Decimal(0),
                amountDue: total,
                lines: {
                  create: updatedOrder.lines.map((line) => ({
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
