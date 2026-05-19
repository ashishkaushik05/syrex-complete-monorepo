import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { assertOutletWarehouseScope } from "./outlet-access";

const invoiceLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  qty: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string()
});

const invoiceChargeSchema = z.object({
  id: z.string(),
  taxChargeId: z.string().nullable(),
  name: z.string(),
  type: z.enum(["percentage", "fixed"]),
  rate: z.string(),
  amount: z.string(),
  displayOrder: z.number().int(),
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
  lines: z.array(invoiceLineSchema),
  charges: z.array(invoiceChargeSchema),
});

const chargePreviewSchema = z.object({
  taxChargeId: z.string(),
  name: z.string(),
  type: z.enum(["percentage", "fixed"]),
  rate: z.string(),
  amount: z.string(),
  displayOrder: z.number().int(),
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
  charges: Array<{
    id: string;
    taxChargeId: string | null;
    name: string;
    type: "percentage" | "fixed";
    rate: { toString(): string };
    amount: { toString(): string };
    displayOrder: number;
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
    })),
    charges: invoice.charges.map((c) => ({
      id: c.id,
      taxChargeId: c.taxChargeId,
      name: c.name,
      type: c.type,
      rate: c.rate.toString(),
      amount: c.amount.toString(),
      displayOrder: c.displayOrder,
    })),
  };
}

export const invoicesRouter = createTRPCRouter({
  list: perm(P.invoices.read)
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
        include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } },
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

  getById: perm(P.invoices.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceSchema)
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.id },
        include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } }
      });
      if (!invoice) {
        throw apiError("NOT_FOUND", "Invoice not found");
      }
      await assertOutletWarehouseScope(ctx, invoice.outletId);
      return toInvoiceItem(invoice);
    }),

  previewCharges: perm(P.invoices.read)
    .input(z.object({ subtotal: z.string().min(1) }))
    .output(
      z.object({
        charges: z.array(chargePreviewSchema),
        subtotal: z.string(),
        total: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const subtotal = new Prisma.Decimal(input.subtotal);
      const activeCharges = await ctx.prisma.taxCharge.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      });
      const charges = activeCharges.map((c) => {
        const amount =
          c.type === "percentage"
            ? subtotal.mul(c.rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            : c.rate.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        return {
          taxChargeId: c.id,
          name: c.name,
          type: c.type,
          rate: c.rate.toFixed(2),
          amount: amount.toFixed(2),
          displayOrder: c.displayOrder,
        };
      });
      const chargesTotal = charges.reduce(
        (sum, c) => sum.add(new Prisma.Decimal(c.amount)),
        new Prisma.Decimal(0)
      );
      return {
        charges,
        subtotal: subtotal.toFixed(2),
        total: subtotal.add(chargesTotal).toFixed(2),
      };
    }),

  updateCharges: perm(P.invoices.write)
    .input(
      z.object({
        invoiceId: z.string().uuid(),
        charges: z.array(
          z.object({
            taxChargeId: z.string().uuid().nullable().optional(),
            name: z.string().min(1),
            type: z.enum(["percentage", "fixed"]),
            rate: z.string(),
            amount: z.string(),
            displayOrder: z.number().int().default(0),
          })
        ),
      })
    )
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where: { id: input.invoiceId },
          include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } },
        });
        if (!invoice) throw apiError("NOT_FOUND", "Invoice not found");
        await assertOutletWarehouseScope(ctx, invoice.outletId);

        // Validate amounts
        for (const c of input.charges) {
          const rate = new Prisma.Decimal(c.rate);
          if (rate.lt(0)) throw apiError("BAD_REQUEST", `Rate must be non-negative for charge "${c.name}"`);
          if (c.type === "percentage" && rate.gt(100)) {
            throw apiError("BAD_REQUEST", `Percentage rate cannot exceed 100 for charge "${c.name}"`);
          }
        }

        // Replace all existing charges
        await tx.invoiceCharge.deleteMany({ where: { invoiceId: input.invoiceId } });
        await tx.invoiceCharge.createMany({
          data: input.charges.map((c, i) => ({
            invoiceId: input.invoiceId,
            taxChargeId: c.taxChargeId ?? null,
            name: c.name,
            type: c.type,
            rate: new Prisma.Decimal(c.rate),
            amount: new Prisma.Decimal(c.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            displayOrder: c.displayOrder ?? i,
          })),
        });

        // Recalculate totals
        const chargesTotal = input.charges.reduce(
          (sum, c) => sum.add(new Prisma.Decimal(c.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)),
          new Prisma.Decimal(0)
        );
        const newTotal = invoice.subtotal.add(chargesTotal);
        const newAmountDue = Prisma.Decimal.max(new Prisma.Decimal(0), newTotal.sub(invoice.amountPaid));

        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: { total: newTotal, amountDue: newAmountDue },
        });

        // Re-aggregate outlet outstanding balance
        const outstanding = await tx.invoice.aggregate({
          where: { outletId: invoice.outletId },
          _sum: { amountDue: true },
        });
        await tx.outlet.update({
          where: { id: invoice.outletId },
          data: { outstandingBalance: outstanding._sum.amountDue ?? new Prisma.Decimal(0) },
        });

        return tx.invoice.findUniqueOrThrow({
          where: { id: input.invoiceId },
          include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } },
        });
      });

      return toInvoiceItem(updated);
    }),
});
