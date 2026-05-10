import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { assertOutletAccess } from "./outlet-access";
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

export const outletPortalRouter = createTRPCRouter({
  summary: perm("outlets:read")
    .input(z.object({ outletId: z.string().uuid() }))
    .output(summarySchema)
    .query(async ({ ctx, input }) => {
      await assertOutletAccess(ctx, input.outletId);

      const outlet = await ctx.prisma.outlet.findUnique({
        where: { id: input.outletId },
        select: { id: true, outstandingBalance: true },
      });
      if (!outlet) {
        throw apiError("NOT_FOUND", "Outlet not found");
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
        outstandingSnapshot: outlet.outstandingBalance.toString(),
        outstandingLive: (invoiceAgg._sum.amountDue ?? 0).toString(),
        openInvoicesCount,
        ordersCount,
      };
    }),

  orderHistory: perm("orders:read")
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

  orderDetail: perm("orders:read")
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

  invoiceDetail: perm("invoices:read")
    .input(z.object({ outletId: z.string().uuid(), invoiceId: z.string().uuid() }))
    .output(
      z.object({
        id: z.string(),
        invoiceNumber: z.string(),
        orderId: z.string(),
        orderNumber: z.string(),
        invoiceDate: z.string(),
        subtotal: z.string(),
        total: z.string(),
        amountPaid: z.string(),
        amountDue: z.string(),
        createdAt: z.string(),
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
        include: { lines: true, order: { select: { orderNumber: true } } },
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
        subtotal: invoice.subtotal.toString(),
        total: invoice.total.toString(),
        amountPaid: invoice.amountPaid.toString(),
        amountDue: invoice.amountDue.toString(),
        createdAt: invoice.createdAt.toISOString(),
        lines: invoice.lines.map((l) => ({
          id: l.id,
          sku: l.sku,
          qty: l.qty,
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
        })),
      };
    }),

  dispatchDetail: perm("orders:read")
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

  invoiceHistory: perm("invoices:read")
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

      const offset = decodeCursor(input.cursor) ?? 0;
      const rows = await ctx.prisma.invoice.findMany({
        where: {
          outletId: input.outletId,
          OR: input.q
            ? [
                { invoiceNumber: { contains: input.q, mode: "insensitive" } },
                {
                  order: {
                    orderNumber: { contains: input.q, mode: "insensitive" },
                  },
                },
              ]
            : undefined,
        },
        select: {
          id: true,
          invoiceNumber: true,
          orderId: true,
          invoiceDate: true,
          total: true,
          amountPaid: true,
          amountDue: true,
          createdAt: true,
        },
        orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
        skip: offset,
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
          total: r.total.toString(),
          amountPaid: r.amountPaid.toString(),
          amountDue: r.amountDue.toString(),
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null,
      };
    }),
});
