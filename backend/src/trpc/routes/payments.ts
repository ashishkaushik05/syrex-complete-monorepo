import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const allocationSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  amount: z.string(),
  allocatedAt: z.string()
});

const paymentSchema = z.object({
  id: z.string(),
  outletId: z.string(),
  amount: z.string(),
  paymentDate: z.string(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
  allocations: z.array(allocationSchema)
});

const createPaymentSchema = z.object({
  outletId: z.string().uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid positive number with up to 2 decimals"),
  paymentDate: z.string().datetime().optional(),
  reference: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  idempotencyKey: z.string().uuid().optional()
});

function toPaymentItem(payment: {
  id: string;
  outletId: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  reference: string | null;
  description: string | null;
  createdAt: Date;
  allocations: Array<{
    id: string;
    invoiceId: string;
    amount: Prisma.Decimal;
    allocatedAt: Date;
  }>;
}) {
  return {
    id: payment.id,
    outletId: payment.outletId,
    amount: payment.amount.toString(),
    paymentDate: payment.paymentDate.toISOString(),
    reference: payment.reference,
    description: payment.description,
    createdAt: payment.createdAt.toISOString(),
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount.toString(),
      allocatedAt: allocation.allocatedAt.toISOString()
    }))
  };
}

export const paymentsRouter = createTRPCRouter({
  list: perm("payments:read")
    .input(
      paginationInputSchema.extend({
        outletId: z.string().uuid().optional(),
        q: z.string().min(1).optional()
      })
    )
    .output(z.object({ items: z.array(paymentSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const rows = await ctx.prisma.outletPayment.findMany({
        where: {
          outletId: input.outletId,
          OR: input.q
            ? [
                { reference: { contains: input.q, mode: "insensitive" } },
                { description: { contains: input.q, mode: "insensitive" } }
              ]
            : undefined
        },
        include: { allocations: true },
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: pageItems.map(toPaymentItem),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm("payments:read")
    .input(z.object({ id: z.string().uuid() }))
    .output(paymentSchema)
    .query(async ({ ctx, input }) => {
      const payment = await ctx.prisma.outletPayment.findUnique({
        where: { id: input.id },
        include: { allocations: true }
      });
      if (!payment) {
        throw apiError("NOT_FOUND", "Payment not found");
      }
      return toPaymentItem(payment);
    }),

  create: perm("payments:write")
    .input(createPaymentSchema)
    .output(paymentSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.idempotencyKey) {
        const existing = await ctx.prisma.outletPayment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { allocations: true }
        });
        if (existing) return toPaymentItem(existing);
      }

      let amount: Prisma.Decimal;
      try {
        amount = new Prisma.Decimal(input.amount);
      } catch {
        throw apiError("BAD_REQUEST", "Invalid payment amount");
      }
      if (amount.lte(0)) {
        throw apiError("BAD_REQUEST", "Payment amount must be greater than zero");
      }

      await ctx.prisma.outlet.findUniqueOrThrow({ where: { id: input.outletId } }).catch(() => {
        throw apiError("BAD_REQUEST", "Invalid outletId");
      });

      const created = await ctx.prisma.$transaction(async (tx) => {
        const payment = await tx.outletPayment.create({
          data: {
            outletId: input.outletId,
            amount,
            paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
            reference: input.reference,
            description: input.description,
            idempotencyKey: input.idempotencyKey
          }
        });

        let remaining = amount;
        const openInvoices = await tx.invoice.findMany({
          where: {
            outletId: input.outletId,
            amountDue: { gt: 0 }
          },
          orderBy: [{ invoiceDate: "asc" }, { id: "asc" }]
        });

        for (const invoice of openInvoices) {
          if (remaining.lte(0)) {
            break;
          }

          const allocate = Prisma.Decimal.min(remaining, invoice.amountDue);
          if (allocate.lte(0)) {
            continue;
          }

          const nextAmountPaid = invoice.amountPaid.add(allocate);
          const nextAmountDue = invoice.total.sub(nextAmountPaid);
          const invoiceUpdate = await tx.invoice.updateMany({
            where: {
              id: invoice.id,
              amountPaid: invoice.amountPaid,
              amountDue: invoice.amountDue
            },
            data: {
              amountPaid: nextAmountPaid,
              amountDue: nextAmountDue
            }
          });
          if (invoiceUpdate.count !== 1) {
            throw apiError("CONFLICT", "Invoice was modified by another request. Retry payment.");
          }

          await tx.outletPaymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: invoice.id,
              amount: allocate
            }
          });

          remaining = remaining.sub(allocate);
        }

        const aggregate = await tx.invoice.aggregate({
          where: { outletId: input.outletId },
          _sum: { amountDue: true }
        });

        await tx.outlet.update({
          where: { id: input.outletId },
          data: {
            outstandingBalance: aggregate._sum.amountDue ?? new Prisma.Decimal(0)
          }
        });

        return tx.outletPayment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { allocations: true }
        });
      });

      return toPaymentItem(created);
    })
});
