import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { assertOutletWarehouseScope, resolveFinancialScope } from "./outlet-access";

type ChargeType = "percentage" | "fixed";
type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

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
  dueDate: z.string().nullable(),
  subtotal: z.string(),
  discountType: z.enum(["percentage", "fixed"]).nullable(),
  discountRate: z.string(),
  discountAmount: z.string(),
  taxableSubtotal: z.string(),
  total: z.string(),
  amountPaid: z.string(),
  amountDue: z.string(),
  daysPastDue: z.number().int().nullable(),
  agingBucket: z.enum(["current", "1_30", "31_60", "61_90", "90_plus"]).nullable(),
  createdAt: z.string(),
  lines: z.array(invoiceLineSchema),
  charges: z.array(invoiceChargeSchema),
});

const chargeInputSchema = z.object({
  taxChargeId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  type: z.enum(["percentage", "fixed"]),
  rate: z.string(),
  displayOrder: z.number().int().default(0),
});

const chargePreviewSchema = z.object({
  taxChargeId: z.string(),
  name: z.string(),
  type: z.enum(["percentage", "fixed"]),
  rate: z.string(),
  amount: z.string(),
  displayOrder: z.number().int(),
});

const arAgingRowSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  outletId: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().nullable(),
  amountDue: z.string(),
  daysPastDue: z.number().int(),
  agingBucket: z.enum(["current", "1_30", "31_60", "61_90", "90_plus"]),
});

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

function computeTaxableSubtotal(subtotal: Prisma.Decimal, discountAmount: Prisma.Decimal) {
  return Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.sub(discountAmount));
}

function computeChargeRows(
  taxableSubtotal: Prisma.Decimal,
  charges: Array<{
    taxChargeId: string | null;
    name: string;
    type: ChargeType;
    rate: Prisma.Decimal;
    displayOrder: number;
  }>,
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

function deriveAging(dueDate: Date | null, amountDue: Prisma.Decimal, asOf: Date): {
  daysPastDue: number | null;
  agingBucket: AgingBucket | null;
} {
  if (amountDue.lte(0)) {
    return { daysPastDue: null, agingBucket: null };
  }
  const effectiveDue = dueDate ?? asOf;
  const ms = asOf.getTime() - effectiveDue.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return { daysPastDue: 0, agingBucket: "current" };
  if (days <= 30) return { daysPastDue: days, agingBucket: "1_30" };
  if (days <= 60) return { daysPastDue: days, agingBucket: "31_60" };
  if (days <= 90) return { daysPastDue: days, agingBucket: "61_90" };
  return { daysPastDue: days, agingBucket: "90_plus" };
}

function toInvoiceItem(
  invoice: {
    id: string;
    invoiceNumber: string;
    orderId: string;
    outletId: string;
    invoiceDate: Date;
    dueDate: Date | null;
    subtotal: Prisma.Decimal;
    discountType: ChargeType | null;
    discountRate: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    total: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    amountDue: Prisma.Decimal;
    createdAt: Date;
    lines: Array<{
      id: string;
      productId: string;
      sku: string;
      qty: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
    charges: Array<{
      id: string;
      taxChargeId: string | null;
      name: string;
      type: ChargeType;
      rate: Prisma.Decimal;
      amount: Prisma.Decimal;
      displayOrder: number;
    }>;
  },
  asOf = new Date(),
) {
  const taxableSubtotal = computeTaxableSubtotal(invoice.subtotal, invoice.discountAmount);
  const aging = deriveAging(invoice.dueDate, invoice.amountDue, asOf);

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    outletId: invoice.outletId,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    subtotal: invoice.subtotal.toString(),
    discountType: invoice.discountType,
    discountRate: invoice.discountRate.toString(),
    discountAmount: invoice.discountAmount.toString(),
    taxableSubtotal: taxableSubtotal.toString(),
    total: invoice.total.toString(),
    amountPaid: invoice.amountPaid.toString(),
    amountDue: invoice.amountDue.toString(),
    daysPastDue: aging.daysPastDue,
    agingBucket: aging.agingBucket,
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

async function recomputeOutletOutstanding(tx: Prisma.TransactionClient, outletId: string) {
  const outstanding = await tx.invoice.aggregate({
    where: { outletId },
    _sum: { amountDue: true },
  });
  await tx.outlet.update({
    where: { id: outletId },
    data: { outstandingBalance: outstanding._sum.amountDue ?? new Prisma.Decimal(0) },
  });
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
      const cursor = decodeCursor(resolved.cursor);
      const { linkedOutletId, hasGlobalAccess, isWarehouseScoped } = resolveFinancialScope(ctx, {
        includeInternalSales: true,
        errorMessage: "No safe invoice scope available",
      });

      if (resolved.outletId && resolved.orderId) {
        const matchingOrder = await ctx.prisma.saleOrder.findFirst({
          where: { id: resolved.orderId, outletId: resolved.outletId },
          select: { id: true },
        });
        if (!matchingOrder) {
          throw apiError("NOT_FOUND", "Order not found");
        }
      }

      const andClauses: Prisma.InvoiceWhereInput[] = [];
      if (resolved.outletId) andClauses.push({ outletId: resolved.outletId });
      if (resolved.orderId) andClauses.push({ orderId: resolved.orderId });
      if (linkedOutletId && !hasGlobalAccess) {
        andClauses.push({ outletId: linkedOutletId });
      } else if (isWarehouseScoped) {
        andClauses.push({ outlet: { warehouseId: ctx.managedWarehouseId } });
      }

      if (resolved.q) andClauses.push({ OR: [{ invoiceNumber: { contains: resolved.q, mode: "insensitive" } }, { order: { orderNumber: { contains: resolved.q, mode: "insensitive" } } }] });
      if (cursor) andClauses.push({ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] });

      const rows = await ctx.prisma.invoice.findMany({
        where: {
          AND: andClauses.length ? andClauses : undefined,
          // TODO(batch-08): replace warehouse fallback with outlet.orgId/warehouse.orgId.
        },
        include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: resolved.limit + 1
      });

      const hasMore = rows.length > resolved.limit;
      const pageItems = hasMore ? rows.slice(0, resolved.limit) : rows;
      return {
        items: pageItems.map((row) => toInvoiceItem(row)),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
      };
    }),

  getById: perm(P.invoices.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(invoiceSchema)
    .query(async ({ ctx, input }) => {
      const { linkedOutletId, hasGlobalAccess, isWarehouseScoped } = resolveFinancialScope(ctx, {
        includeInternalSales: true,
        errorMessage: "No safe invoice scope available",
      });

      const whereClauses: Prisma.InvoiceWhereInput[] = [{ id: input.id }];
      if (linkedOutletId && !hasGlobalAccess) {
        whereClauses.push({ outletId: linkedOutletId });
      } else if (isWarehouseScoped) {
        whereClauses.push({ outlet: { warehouseId: ctx.managedWarehouseId } });
      }

      const invoice = await ctx.prisma.invoice.findFirst({
        where: { AND: whereClauses },
        include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } }
      });
      if (!invoice) {
        throw apiError("NOT_FOUND", "Invoice not found");
      }
      return toInvoiceItem(invoice);
    }),

  previewCharges: perm(P.invoices.read)
    .input(
      z.object({
        subtotal: z.string().min(1),
        discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
        discountRate: z.string().optional(),
      }),
    )
    .output(
      z.object({
        charges: z.array(chargePreviewSchema),
        subtotal: z.string(),
        discountAmount: z.string(),
        taxableSubtotal: z.string(),
        total: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const subtotal = new Prisma.Decimal(input.subtotal);
      const discountRate = new Prisma.Decimal(input.discountRate ?? "0");
      if (discountRate.lt(0)) throw apiError("BAD_REQUEST", "Discount rate must be non-negative");
      if (input.discountType === "percentage" && discountRate.gt(100)) {
        throw apiError("BAD_REQUEST", "Discount percentage cannot exceed 100");
      }
      const discountAmount = computeDiscountAmount(subtotal, input.discountType ?? null, discountRate);
      const taxableSubtotal = computeTaxableSubtotal(subtotal, discountAmount);

      const activeCharges = await ctx.prisma.taxCharge.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      });
      const computed = computeChargeRows(
        taxableSubtotal,
        activeCharges.map((c) => ({
          taxChargeId: c.id,
          name: c.name,
          type: c.type,
          rate: c.rate,
          displayOrder: c.displayOrder,
        })),
      );
      const charges = computed.map((c) => ({
        taxChargeId: c.taxChargeId ?? "",
        name: c.name,
        type: c.type,
        rate: c.rate.toFixed(2),
        amount: c.amount.toFixed(2),
        displayOrder: c.displayOrder,
      }));
      const chargesTotal = computed.reduce(
        (sum, c) => sum.add(c.amount),
        new Prisma.Decimal(0)
      );
      return {
        charges,
        subtotal: subtotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        taxableSubtotal: taxableSubtotal.toFixed(2),
        total: taxableSubtotal.add(chargesTotal).toFixed(2),
      };
    }),

  updateCharges: perm(P.invoices.write)
    .input(
      z.object({
        invoiceId: z.string().uuid(),
        charges: z.array(
          chargeInputSchema.extend({
            amount: z.string().optional(), // ignored; server recomputes
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

        const subtotal = invoice.subtotal;
        const discountAmount = computeDiscountAmount(subtotal, invoice.discountType, invoice.discountRate);
        const taxableSubtotal = computeTaxableSubtotal(subtotal, discountAmount);

        const defs = input.charges.map((c, i) => {
          const rate = new Prisma.Decimal(c.rate);
          if (rate.lt(0)) throw apiError("BAD_REQUEST", `Rate must be non-negative for charge "${c.name}"`);
          if (c.type === "percentage" && rate.gt(100)) {
            throw apiError("BAD_REQUEST", `Percentage rate cannot exceed 100 for charge "${c.name}"`);
          }
          return {
            taxChargeId: c.taxChargeId ?? null,
            name: c.name,
            type: c.type,
            rate,
            displayOrder: c.displayOrder ?? i,
          };
        });

        const chargeRows = computeChargeRows(taxableSubtotal, defs);
        await tx.invoiceCharge.deleteMany({ where: { invoiceId: input.invoiceId } });
        await tx.invoiceCharge.createMany({
          data: chargeRows.map((c) => ({
            invoiceId: input.invoiceId,
            taxChargeId: c.taxChargeId,
            name: c.name,
            type: c.type,
            rate: c.rate,
            amount: c.amount,
            displayOrder: c.displayOrder,
          })),
        });

        const chargesTotal = chargeRows.reduce(
          (sum, c) => sum.add(c.amount),
          new Prisma.Decimal(0)
        );
        const newTotal = taxableSubtotal.add(chargesTotal);
        const newAmountDue = Prisma.Decimal.max(new Prisma.Decimal(0), newTotal.sub(invoice.amountPaid));
        const taxSnapshot = defs.map((c) => ({
          taxChargeId: c.taxChargeId,
          name: c.name,
          type: c.type,
          rate: c.rate.toFixed(2),
          displayOrder: c.displayOrder,
        }));

        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: {
            discountAmount,
            taxSnapshot,
            total: newTotal,
            amountDue: newAmountDue
          },
        });

        await recomputeOutletOutstanding(tx, invoice.outletId);

        return tx.invoice.findUniqueOrThrow({
          where: { id: input.invoiceId },
          include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } },
        });
      });

      return toInvoiceItem(updated);
    }),

  update: perm(P.invoices.write)
    .input(
      z.object({
        invoiceId: z.string().uuid(),
        dueDate: z.string().datetime().nullable().optional(),
        discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
        discountRate: z.string().optional(),
        lines: z.array(
          z.object({
            id: z.string().uuid(),
            qty: z.number().int().positive(),
            unitPrice: z.string(),
          }),
        ).optional(),
        charges: z.array(chargeInputSchema).optional(),
      }),
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

        if (input.lines) {
          const known = new Set(invoice.lines.map((line) => line.id));
          for (const line of input.lines) {
            if (!known.has(line.id)) {
              throw apiError("BAD_REQUEST", "Invoice line does not belong to invoice");
            }
            const unitPrice = new Prisma.Decimal(line.unitPrice);
            if (unitPrice.lt(0)) throw apiError("BAD_REQUEST", "Unit price must be non-negative");
            await tx.invoiceLine.update({
              where: { id: line.id },
              data: {
                qty: line.qty,
                unitPrice,
                lineTotal: unitPrice.mul(line.qty),
              },
            });
          }
        }

        const lines = await tx.invoiceLine.findMany({ where: { invoiceId: input.invoiceId } });
        const subtotal = lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));

        const discountType = input.discountType !== undefined ? input.discountType : invoice.discountType;
        const discountRate = input.discountRate !== undefined
          ? new Prisma.Decimal(input.discountRate)
          : invoice.discountRate;
        if (discountRate.lt(0)) throw apiError("BAD_REQUEST", "Discount rate must be non-negative");
        if (discountType === "percentage" && discountRate.gt(100)) {
          throw apiError("BAD_REQUEST", "Discount percentage cannot exceed 100");
        }
        const discountAmount = computeDiscountAmount(subtotal, discountType, discountRate);
        const taxableSubtotal = computeTaxableSubtotal(subtotal, discountAmount);

        const chargeDefs = (input.charges ?? invoice.charges.map((c) => ({
          taxChargeId: c.taxChargeId,
          name: c.name,
          type: c.type,
          rate: c.rate.toString(),
          displayOrder: c.displayOrder,
        }))).map((c, i) => {
          const rate = new Prisma.Decimal(c.rate);
          if (rate.lt(0)) throw apiError("BAD_REQUEST", `Rate must be non-negative for charge "${c.name}"`);
          if (c.type === "percentage" && rate.gt(100)) {
            throw apiError("BAD_REQUEST", `Percentage rate cannot exceed 100 for charge "${c.name}"`);
          }
          return {
            taxChargeId: c.taxChargeId ?? null,
            name: c.name,
            type: c.type,
            rate,
            displayOrder: c.displayOrder ?? i,
          };
        });

        const chargeRows = computeChargeRows(taxableSubtotal, chargeDefs);
        await tx.invoiceCharge.deleteMany({ where: { invoiceId: input.invoiceId } });
        await tx.invoiceCharge.createMany({
          data: chargeRows.map((c) => ({
            invoiceId: input.invoiceId,
            taxChargeId: c.taxChargeId,
            name: c.name,
            type: c.type,
            rate: c.rate,
            amount: c.amount,
            displayOrder: c.displayOrder,
          })),
        });

        const chargesTotal = chargeRows.reduce((sum, c) => sum.add(c.amount), new Prisma.Decimal(0));
        const total = taxableSubtotal.add(chargesTotal);
        const amountDue = Prisma.Decimal.max(new Prisma.Decimal(0), total.sub(invoice.amountPaid));
        const taxSnapshot = chargeDefs.map((c) => ({
          taxChargeId: c.taxChargeId,
          name: c.name,
          type: c.type,
          rate: c.rate.toFixed(2),
          displayOrder: c.displayOrder,
        }));

        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: {
            dueDate: input.dueDate !== undefined ? (input.dueDate ? new Date(input.dueDate) : null) : invoice.dueDate,
            subtotal,
            discountType,
            discountRate,
            discountAmount,
            taxSnapshot,
            total,
            amountDue,
          },
        });

        await recomputeOutletOutstanding(tx, invoice.outletId);

        return tx.invoice.findUniqueOrThrow({
          where: { id: input.invoiceId },
          include: { lines: true, charges: { orderBy: [{ displayOrder: "asc" }] } },
        });
      });

      return toInvoiceItem(updated);
    }),

  arAging: perm(P.invoices.read)
    .input(
      paginationInputSchema.extend({
        outletId: z.string().uuid().optional(),
        asOf: z.string().datetime().optional(),
      }).optional(),
    )
    .output(
      z.object({
        items: z.array(arAgingRowSchema),
        nextCursor: z.string().nullable(),
        summary: z.object({
          current: z.string(),
          bucket1_30: z.string(),
          bucket31_60: z.string(),
          bucket61_90: z.string(),
          bucket90Plus: z.string(),
          totalOutstanding: z.string(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const resolved = input ?? { limit: 100 };
      const cursor = decodeCursor(resolved.cursor);
      const asOf = resolved.asOf ? new Date(resolved.asOf) : new Date();
      const { linkedOutletId, hasGlobalAccess, isWarehouseScoped } = resolveFinancialScope(ctx, {
        includeInternalSales: true,
        errorMessage: "No safe invoice scope available",
      });

      const andClauses: Prisma.InvoiceWhereInput[] = [
        { amountDue: { gt: new Prisma.Decimal(0) } },
      ];
      if (resolved.outletId) {
        andClauses.push({ outletId: resolved.outletId });
      }
      if (linkedOutletId && !hasGlobalAccess) {
        andClauses.push({ outletId: linkedOutletId });
      } else if (isWarehouseScoped) {
        andClauses.push({ outlet: { warehouseId: ctx.managedWarehouseId } });
      }

      const where: Prisma.InvoiceWhereInput = {
        AND: andClauses,
      };
      const pageClauses: Prisma.InvoiceWhereInput[] = [...andClauses];
      if (cursor) pageClauses.push({ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] });

      const [rows, allOpen] = await Promise.all([
        ctx.prisma.invoice.findMany({
          where: { AND: pageClauses },
          select: {
            id: true,
            invoiceNumber: true,
            outletId: true,
            invoiceDate: true,
            dueDate: true,
            amountDue: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: resolved.limit + 1,
        }),
        ctx.prisma.invoice.findMany({
          where,
          select: {
            dueDate: true,
            amountDue: true,
          },
        }),
      ]);

      const hasMore = rows.length > resolved.limit;
      const pageItems = hasMore ? rows.slice(0, resolved.limit) : rows;

      const summary = {
        current: new Prisma.Decimal(0),
        bucket1_30: new Prisma.Decimal(0),
        bucket31_60: new Prisma.Decimal(0),
        bucket61_90: new Prisma.Decimal(0),
        bucket90Plus: new Prisma.Decimal(0),
      };
      for (const row of allOpen) {
        const aging = deriveAging(row.dueDate, row.amountDue, asOf);
        switch (aging.agingBucket) {
          case "current":
            summary.current = summary.current.add(row.amountDue);
            break;
          case "1_30":
            summary.bucket1_30 = summary.bucket1_30.add(row.amountDue);
            break;
          case "31_60":
            summary.bucket31_60 = summary.bucket31_60.add(row.amountDue);
            break;
          case "61_90":
            summary.bucket61_90 = summary.bucket61_90.add(row.amountDue);
            break;
          case "90_plus":
            summary.bucket90Plus = summary.bucket90Plus.add(row.amountDue);
            break;
          default:
            break;
        }
      }

      return {
        items: pageItems.map((row) => {
          const aging = deriveAging(row.dueDate, row.amountDue, asOf);
          return {
            id: row.id,
            invoiceNumber: row.invoiceNumber,
            outletId: row.outletId,
            invoiceDate: row.invoiceDate.toISOString(),
            dueDate: row.dueDate?.toISOString() ?? null,
            amountDue: row.amountDue.toString(),
            daysPastDue: aging.daysPastDue ?? 0,
            agingBucket: aging.agingBucket ?? "current",
          };
        }),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null,
        summary: {
          current: summary.current.toString(),
          bucket1_30: summary.bucket1_30.toString(),
          bucket31_60: summary.bucket31_60.toString(),
          bucket61_90: summary.bucket61_90.toString(),
          bucket90Plus: summary.bucket90Plus.toString(),
          totalOutstanding: summary.current
            .add(summary.bucket1_30)
            .add(summary.bucket31_60)
            .add(summary.bucket61_90)
            .add(summary.bucket90Plus)
            .toString(),
        },
      };
    }),
});
