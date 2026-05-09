import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const invoiceLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  qty: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string()
});

const invoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  orderId: z.string(),
  outletId: z.string(),
  invoiceDate: z.string(),
  subtotal: z.string(),
  total: z.string(),
  amountPaid: z.string(),
  amountDue: z.string(),
  createdAt: z.string(),
  lines: z.array(invoiceLineSchema)
});

function toInvoiceItem(invoice: {
  id: string;
  invoiceNumber: string;
  orderId: string;
  outletId: string;
  invoiceDate: Date;
  subtotal: { toString(): string };
  total: { toString(): string };
  amountPaid: { toString(): string };
  amountDue: { toString(): string };
  createdAt: Date;
  lines: Array<{
    id: string;
    productId: string;
    sku: string;
    qty: number;
    unitPrice: { toString(): string };
    lineTotal: { toString(): string };
  }>;
}) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    outletId: invoice.outletId,
    invoiceDate: invoice.invoiceDate.toISOString(),
    subtotal: invoice.subtotal.toString(),
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    amountDue: invoice.amountDue.toString(),
    createdAt: invoice.createdAt.toISOString(),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      sku: line.sku,
      qty: line.qty,
      unitPrice: line.unitPrice.toString(),
      lineTotal: line.lineTotal.toString()
    }))
  };
}

export const invoicesRouter = createTRPCRouter({
  list: perm("invoices:read")
    .input(
      paginationInputSchema
        .extend({
          outletId: z.string().uuid().optional(),
          orderId: z.string().uuid().optional(),
          q: z.string().min(1).optional()
        })
        .optional()
    )
    .output(z.object({ items: z.array(invoiceSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const resolved = input ?? { limit: 25 };
      const offset = decodeCursor(resolved.cursor) ?? 0;
      const rows = await ctx.prisma.invoice.findMany({
        where: {
          outletId: resolved.outletId,
          orderId: resolved.orderId,
          OR: resolved.q
            ? [
                { invoiceNumber: { contains: resolved.q, mode: "insensitive" } },
                { order: { orderNumber: { contains: resolved.q, mode: "insensitive" } } }
              ]
            : undefined
        },
        include: { lines: true },
        orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
        skip: offset,
        take: resolved.limit + 1
      });

      const hasMore = rows.length > resolved.limit;
      const pageItems = hasMore ? rows.slice(0, resolved.limit) : rows;
      return {
        items: pageItems.map(toInvoiceItem),
        nextCursor: hasMore ? encodeCursor(offset + resolved.limit) : null
      };
    }),

  getById: perm("invoices:read")
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceSchema)
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.id },
        include: { lines: true }
      });
      if (!invoice) {
        throw apiError("NOT_FOUND", "Invoice not found");
      }
      return toInvoiceItem(invoice);
    })
});
