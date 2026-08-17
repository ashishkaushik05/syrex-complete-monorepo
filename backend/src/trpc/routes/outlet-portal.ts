import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { assertOutletAccess, findActorLinkedOutletId } from "./outlet-access";

const dispatchListItemSchema = z.object({
  id: z.string(),
  dispatchDate: z.string(),
  deliveryStatus: z.string(),
  transporterName: z.string(),
  vehicleNumber: z.string(),
  lrNumber: z.string().nullable(),
  estimatedDelivery: z.string().nullable(),
  deliveredAt: z.string().nullable(),
});
import {
  orderDetailSchema,
  orderListFilterSchema,
  orderSchema,
  queryOrderDetail,
  queryOrderList,
} from "./orders-shared";

const invoiceListItemSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  orderId: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  total: z.string(),
  amountPaid: z.string(),
  amountDue: z.string(),
  createdAt: z.string(),
});

const summarySchema = z.object({
  outletId: z.string(),
  outstandingSnapshot: z.string(),
  outstandingLive: z.string(),
  openInvoicesCount: z.number().int(),
  ordersCount: z.number().int(),
});

const outletProfileSchema = z.object({
  id: z.string(),
  outletCode: z.string(),
  name: z.string(),
  ownerName: z.string(),
  phone: z.string(),
  address: z.string(),
  creditLimit: z.string(),
  outstandingBalance: z.string(),
  isActive: z.boolean(),
  legalName: z.string().nullable(),
  gstin: z.string().nullable(),
  billingAddress1: z.string().nullable(),
  billingAddress2: z.string().nullable(),
  billingCity: z.string().nullable(),
  billingState: z.string().nullable(),
  billingPincode: z.string().nullable(),
  warehouseId: z.string().nullable(),
});

const updateBillingInputSchema = z.object({
  billingProfileId: z.string().uuid().nullable(),
});

export const outletPortalRouter = createTRPCRouter({
  myProfile: perm(P.outlets.read)
    .output(outletProfileSchema)
    .query(async ({ ctx }) => {
      const actorId = ctx.actor.id!;
      const outlet = await ctx.prisma.outlet.findUnique({
        where: { userId: actorId },
        select: {
          id: true, outletCode: true, name: true, ownerName: true, phone: true,
          address: true, creditLimit: true, outstandingBalance: true, isActive: true,
          warehouseId: true,
          billingProfile: {
            select: {
              legalName: true, gstin: true, addressLine1: true, addressLine2: true,
              city: true, state: true, pincode: true,
            },
          },
        },
      });
      if (!outlet) throw apiError("NOT_FOUND", "No outlet linked to this account");
      return {
        ...outlet,
        creditLimit: outlet.creditLimit.toString(),
        outstandingBalance: outlet.outstandingBalance.toString(),
        warehouseId: outlet.warehouseId ?? null,
        legalName: outlet.billingProfile?.legalName ?? null,
        gstin: outlet.billingProfile?.gstin ?? null,
        billingAddress1: outlet.billingProfile?.addressLine1 ?? null,
        billingAddress2: outlet.billingProfile?.addressLine2 ?? null,
        billingCity: outlet.billingProfile?.city ?? null,
        billingState: outlet.billingProfile?.state ?? null,
        billingPincode: outlet.billingProfile?.pincode ?? null,
      };
    }),

  updateBilling: perm(P.outlets.write)
    .input(updateBillingInputSchema)
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;
      const outlet = await ctx.prisma.outlet.findUnique({
        where: { userId: actorId },
        select: { id: true },
      });
      if (!outlet) throw apiError("NOT_FOUND", "No outlet linked to this account");
      if (input.billingProfileId) {
        const profile = await ctx.prisma.billingProfile.findUnique({ where: { id: input.billingProfileId } });
        if (!profile || !profile.isActive || profile.profileType !== "outlet") {
          throw apiError("BAD_REQUEST", "Outlet billing profile must be active and have type outlet");
        }
      }
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { billingProfileId: input.billingProfileId },
      });
      return { ok: true };
    }),

  summary: perm(P.outlets.read)
    .input(z.object({ outletId: z.string().uuid() }))
    .output(summarySchema)
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);

      const outlet = await ctx.prisma.outlet.findUnique({
        where: { id: input.outletId },
        select: { id: true, warehouseId: true },
      });
      if (!outlet) {
        throw apiError("NOT_FOUND", "Outlet not found");
      }

      const isSuperAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
      if (!isSuperAdmin) {
        const linkedOutletId = findActorLinkedOutletId(ctx);
        if (linkedOutletId) {
          if (linkedOutletId !== input.outletId) {
            throw apiError("FORBIDDEN", "Access denied to this outlet");
          }
        } else if (ctx.managedWarehouseId) {
          if (outlet.warehouseId !== ctx.managedWarehouseId) {
            throw apiError("FORBIDDEN", "Access denied to this outlet");
          }
        } else {
          throw apiError("FORBIDDEN", "No safe outlet scope available");
        }
        // TODO(batch-08): replace warehouse fallback with outlet.orgId/warehouse.orgId check.
      }

      const [invoiceAgg, openInvoicesCount, ordersCount] = await Promise.all([
        ctx.prisma.invoice.aggregate({
          where: { outletId: input.outletId },
          _sum: { amountDue: true },
        }),
        ctx.prisma.invoice.count({
          where: { outletId: input.outletId, amountDue: { gt: 0 } },
        }),
        ctx.prisma.saleOrder.count({
          where: {
            outletId: input.outletId,
            status: { notIn: ["cancelled", "rejected"] },
          },
        }),
      ]);

      return {
        outletId: outlet.id,
        outstandingSnapshot: (invoiceAgg._sum.amountDue ?? 0).toString(),
        outstandingLive: (invoiceAgg._sum.amountDue ?? 0).toString(),
        openInvoicesCount,
        ordersCount,
      };
    }),

  orderHistory: perm(P.orders.read)
    .input(
      orderListFilterSchema
        .omit({ outletId: true })
        .extend({ outletId: z.string().uuid() }),
    )
    .output(
      z.object({
        items: z.array(orderSchema),
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);

      const list = await queryOrderList(
        ctx,
        {
          cursor: input.cursor,
          limit: input.limit,
          outletId: input.outletId,
          status: input.status,
          q: input.q,
        },
        { forcedOutletId: input.outletId },
      );

      return list;
    }),

  orderDetail: perm(P.orders.read)
    .input(
      z.object({ outletId: z.string().uuid(), orderId: z.string().uuid() }),
    )
    .output(orderDetailSchema)
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);
      const detail = await queryOrderDetail(ctx, input.orderId);
      if (detail.outletId !== input.outletId) {
        throw apiError("NOT_FOUND", "Order not found");
      }
      return detail;
    }),

  invoiceDetail: perm(P.invoices.read)
    .input(z.object({ outletId: z.string().uuid(), invoiceId: z.string().uuid() }))
    .output(
      z.object({
        id: z.string(),
        invoiceNumber: z.string(),
        orderId: z.string(),
        orderNumber: z.string(),
        invoiceDate: z.string(),
        dueDate: z.string().nullable(),
        subtotal: z.string(),
        discountType: z.enum(["percentage", "fixed"]).nullable(),
        discountRate: z.string(),
        discountAmount: z.string(),
        total: z.string(),
        amountPaid: z.string(),
        amountDue: z.string(),
        createdAt: z.string(),
        charges: z.array(
          z.object({
            id: z.string(),
            taxChargeId: z.string().nullable(),
            name: z.string(),
            type: z.enum(["percentage", "fixed"]),
            rate: z.string(),
            amount: z.string(),
            displayOrder: z.number().int(),
          }),
        ),
        lines: z.array(
          z.object({
            id: z.string(),
            sku: z.string(),
            qty: z.number().int(),
            unitPrice: z.string(),
            lineTotal: z.string(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.invoiceId },
        include: {
          lines: true,
          charges: { orderBy: [{ displayOrder: "asc" }] },
          order: { select: { orderNumber: true } },
        },
      });
      if (!invoice || invoice.outletId !== input.outletId) {
        throw apiError("NOT_FOUND", "Invoice not found");
      }
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        orderNumber: invoice.order.orderNumber,
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        subtotal: invoice.subtotal.toString(),
        discountType: invoice.discountType,
        discountRate: invoice.discountRate.toString(),
        discountAmount: invoice.discountAmount.toString(),
        total: invoice.total.toString(),
        amountPaid: invoice.amountPaid.toString(),
        amountDue: invoice.amountDue.toString(),
        createdAt: invoice.createdAt.toISOString(),
        charges: invoice.charges.map((c) => ({
          id: c.id,
          taxChargeId: c.taxChargeId,
          name: c.name,
          type: c.type,
          rate: c.rate.toString(),
          amount: c.amount.toString(),
          displayOrder: c.displayOrder,
        })),
        lines: invoice.lines.map((l) => ({
          id: l.id,
          sku: l.sku,
          qty: l.qty,
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
        })),
      };
    }),

  dispatchDetail: perm(P.orders.read)
    .input(z.object({ outletId: z.string().uuid(), dispatchId: z.string().uuid() }))
    .output(
      z.object({
        id: z.string(),
        dispatchDate: z.string(),
        deliveryStatus: z.string(),
        transporterName: z.string(),
        vehicleNumber: z.string(),
        lrNumber: z.string().nullable(),
        estimatedDelivery: z.string().nullable(),
        deliveredAt: z.string().nullable(),
        lines: z.array(
          z.object({
            id: z.string(),
            sku: z.string(),
            qtyOrdered: z.number().int(),
            qtyDispatched: z.number().int(),
            serialNumbers: z.array(z.string()),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);
      const dispatch = await ctx.prisma.dispatch.findFirst({
        where: {
          id: input.dispatchId,
          lines: { some: { orderLine: { order: { outletId: input.outletId } } } },
        },
        include: { lines: { include: { orderLine: { select: { qtyOrdered: true } } } } },
      });
      if (!dispatch) {
        throw apiError("NOT_FOUND", "Dispatch not found");
      }
      return {
        id: dispatch.id,
        dispatchDate: dispatch.dispatchDate.toISOString(),
        deliveryStatus: dispatch.deliveryStatus,
        transporterName: dispatch.transporterName,
        vehicleNumber: dispatch.vehicleNumber,
        lrNumber: dispatch.lrNumber,
        estimatedDelivery: dispatch.estimatedDelivery?.toISOString() ?? null,
        deliveredAt: dispatch.deliveredAt?.toISOString() ?? null,
        lines: dispatch.lines.map((l) => ({
          id: l.id,
          sku: l.sku,
          qtyOrdered: l.orderLine.qtyOrdered,
          qtyDispatched: l.qtyDispatched,
          serialNumbers: (l.serialNumbers as string[]) ?? [],
        })),
      };
    }),

  cancel: perm(P.orders.write)
    .input(z.object({ outletId: z.string().uuid(), orderId: z.string().uuid() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);
      const order = await ctx.prisma.saleOrder.findUnique({
        where: { id: input.orderId },
        select: { id: true, outletId: true, status: true },
      });
      if (!order || order.outletId !== input.outletId) {
        throw apiError("NOT_FOUND", "Order not found");
      }
      if (order.status !== "pending_approval") {
        throw apiError("CONFLICT", "Only pending_approval orders can be cancelled");
      }
      await ctx.prisma.saleOrder.update({
        where: { id: input.orderId },
        data: { status: "cancelled" },
      });
      return { ok: true };
    }),

  dispatchHistory: perm(P.dispatches.read)
    .input(paginationInputSchema.extend({ outletId: z.string().uuid() }))
    .output(z.object({ items: z.array(dispatchListItemSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);

      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.dispatch.findMany({
        where: {
          lines: { some: { orderLine: { order: { outletId: input.outletId } } } },
          ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          dispatchDate: true,
          deliveryStatus: true,
          transporterName: true,
          vehicleNumber: true,
          lrNumber: true,
          estimatedDelivery: true,
          deliveredAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items: pageItems.map((d) => ({
          id: d.id,
          dispatchDate: d.dispatchDate.toISOString(),
          deliveryStatus: d.deliveryStatus,
          transporterName: d.transporterName,
          vehicleNumber: d.vehicleNumber,
          lrNumber: d.lrNumber,
          estimatedDelivery: d.estimatedDelivery?.toISOString() ?? null,
          deliveredAt: d.deliveredAt?.toISOString() ?? null,
        })),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null,
      };
    }),

  invoiceHistory: perm(P.invoices.read)
    .input(
      paginationInputSchema.extend({
        outletId: z.string().uuid(),
        q: z.string().min(1).optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(invoiceListItemSchema),
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);

      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.invoice.findMany({
        where: {
          outletId: input.outletId,
          AND: [
            ...(input.q ? [{ OR: [{ invoiceNumber: { contains: input.q, mode: "insensitive" as const } }, { order: { orderNumber: { contains: input.q, mode: "insensitive" as const } } }] }] : []),
            ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          orderId: true,
          invoiceDate: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          amountDue: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items: pageItems.map((r) => ({
          id: r.id,
          invoiceNumber: r.invoiceNumber,
          orderId: r.orderId,
          invoiceDate: r.invoiceDate.toISOString(),
          dueDate: r.dueDate?.toISOString() ?? null,
          total: r.total.toString(),
          amountPaid: r.amountPaid.toString(),
          amountDue: r.amountDue.toString(),
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null,
      };
    }),
});
