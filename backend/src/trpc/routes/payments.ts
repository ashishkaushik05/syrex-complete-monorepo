import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { assertOutletWarehouseScope, resolveFinancialScope } from "./outlet-access";
import type { TrpcContext } from "../context";
import { postPaymentReceived, postPaymentReversed } from "../../accounts/posting";

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
  voidedAt: z.string().nullable(),
  voidedById: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  allocations: z.array(allocationSchema),
  reversal: z.object({
    id: z.string(),
    amount: z.string(),
    reason: z.string(),
    reversedById: z.string().nullable(),
    reversedAt: z.string(),
  }).nullable(),
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

const voidPaymentSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

function toPaymentItem(payment: {
  id: string;
  outletId: string;
  amount: Prisma.Decimal;
  paymentDate: Date;
  reference: string | null;
  description: string | null;
  voidedAt?: Date | null;
  voidedById?: string | null;
  voidReason?: string | null;
  createdAt: Date;
  allocations: Array<{
    id: string;
    invoiceId: string;
    amount: Prisma.Decimal;
    allocatedAt: Date;
  }>;
  reversal?: {
    id: string;
    amount: Prisma.Decimal;
    reason: string;
    reversedById: string | null;
    reversedAt: Date;
  } | null;
}) {
  return {
    id: payment.id,
    outletId: payment.outletId,
    amount: payment.amount.toString(),
    paymentDate: payment.paymentDate.toISOString(),
    reference: payment.reference,
    description: payment.description,
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    voidedById: payment.voidedById ?? null,
    voidReason: payment.voidReason ?? null,
    createdAt: payment.createdAt.toISOString(),
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount.toString(),
      allocatedAt: allocation.allocatedAt.toISOString()
    })),
    reversal: payment.reversal
      ? {
          id: payment.reversal.id,
          amount: payment.reversal.amount.toString(),
          reason: payment.reversal.reason,
          reversedById: payment.reversal.reversedById,
          reversedAt: payment.reversal.reversedAt.toISOString(),
        }
      : null,
  };
}

async function resolvePaymentScope(ctx: TrpcContext) {
  const { linkedOutletId, hasGlobalAccess, isWarehouseScoped } = resolveFinancialScope(ctx, {
    errorMessage: "No safe payment scope available",
  });
  return { linkedOutletId, isSuperAdmin: hasGlobalAccess, isWarehouseScoped };
}

export const paymentsRouter = createTRPCRouter({
  list: perm(P.payments.read)
    .input(
      paginationInputSchema.extend({
        outletId: z.string().uuid().optional(),
        q: z.string().min(1).optional()
      })
    )
    .output(z.object({ items: z.array(paymentSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const { linkedOutletId, isSuperAdmin, isWarehouseScoped } = await resolvePaymentScope(ctx);
      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.outletPayment.findMany({
        where: {
          AND: [
            ...(input.outletId ? [{ outletId: input.outletId }] : []),
            ...(linkedOutletId ? [{ outletId: linkedOutletId }] : []),
            ...(!isSuperAdmin && !linkedOutletId && isWarehouseScoped
              ? [{ outlet: { warehouseId: ctx.managedWarehouseId } }]
              : []),
            ...(input.q ? [{ OR: [{ reference: { contains: input.q, mode: "insensitive" as const } }, { description: { contains: input.q, mode: "insensitive" as const } }] }] : []),
            ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
          ],
        },
        include: { allocations: true, reversal: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: pageItems.map(toPaymentItem),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
      };
    }),

  getById: perm(P.payments.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(paymentSchema)
    .query(async ({ ctx, input }) => {
      const { linkedOutletId, isSuperAdmin, isWarehouseScoped } = await resolvePaymentScope(ctx);
      const payment = await ctx.prisma.outletPayment.findFirst({
        where: {
          AND: [
            { id: input.id },
            ...(linkedOutletId ? [{ outletId: linkedOutletId }] : []),
            ...(!isSuperAdmin && !linkedOutletId && isWarehouseScoped
              ? [{ outlet: { warehouseId: ctx.managedWarehouseId } }]
              : []),
          ],
        },
        include: { allocations: true, reversal: true }
      });
      if (!payment) {
        throw apiError("NOT_FOUND", "Payment not found");
      }
      return toPaymentItem(payment);
    }),

  create: perm(P.payments.write)
    .input(createPaymentSchema)
    .output(paymentSchema)
    .mutation(async ({ ctx, input }) => {
      const { linkedOutletId, isSuperAdmin } = await resolvePaymentScope(ctx);
      if (linkedOutletId && linkedOutletId !== input.outletId) {
        throw apiError("FORBIDDEN", "Access denied to this outlet");
      }
      if (!isSuperAdmin && !linkedOutletId && ctx.managedWarehouseId) {
        await assertOutletWarehouseScope(ctx, input.outletId);
      }

      if (input.idempotencyKey) {
        const existing = await ctx.prisma.outletPayment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { allocations: true, reversal: true }
        });
        if (existing) {
          if (linkedOutletId && existing.outletId !== linkedOutletId) {
            throw apiError("FORBIDDEN", "Access denied to this outlet");
          }
          if (!isSuperAdmin && !linkedOutletId && ctx.managedWarehouseId) {
            await assertOutletWarehouseScope(ctx, existing.outletId);
          }
          return toPaymentItem(existing);
        }
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

        // Post the double-entry journal: Dr Bank · Cr Debtors (outlet)
        await postPaymentReceived(tx, {
          paymentId: payment.id,
          reference: payment.reference ?? payment.id,
          outletId: input.outletId,
          paymentDate: payment.paymentDate,
          amount,
          postedById: ctx.actor.id,
        });

        return tx.outletPayment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { allocations: true, reversal: true }
        });
      });

      return toPaymentItem(created);
    }),

  void: perm(P.payments.void)
    .input(voidPaymentSchema)
    .output(paymentSchema)
    .mutation(async ({ ctx, input }) => {
      const { linkedOutletId, isSuperAdmin } = await resolvePaymentScope(ctx);

      const existing = await ctx.prisma.outletPayment.findUnique({
        where: { id: input.id },
        select: { outletId: true },
      });
      if (!existing) {
        throw apiError("NOT_FOUND", "Payment not found");
      }
      if (linkedOutletId && linkedOutletId !== existing.outletId) {
        throw apiError("FORBIDDEN", "Access denied to this outlet");
      }
      if (!isSuperAdmin && !linkedOutletId && ctx.managedWarehouseId) {
        await assertOutletWarehouseScope(ctx, existing.outletId);
      }

      const voided = await ctx.prisma.$transaction(async (tx) => {
        const payment = await tx.outletPayment.findUnique({
          where: { id: input.id },
          include: { allocations: true, reversal: true },
        });
        if (!payment) {
          throw apiError("NOT_FOUND", "Payment not found");
        }
        if (payment.voidedAt || payment.reversal) {
          throw apiError("CONFLICT", "Payment is already voided");
        }

        for (const allocation of payment.allocations) {
          const invoice = await tx.invoice.findUnique({
            where: { id: allocation.invoiceId },
          });
          if (!invoice) {
            throw apiError("CONFLICT", "Allocated invoice no longer exists");
          }

          const nextAmountPaid = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            invoice.amountPaid.sub(allocation.amount),
          );
          const nextAmountDue = invoice.total.sub(nextAmountPaid);
          const invoiceUpdate = await tx.invoice.updateMany({
            where: {
              id: invoice.id,
              amountPaid: invoice.amountPaid,
              amountDue: invoice.amountDue,
            },
            data: {
              amountPaid: nextAmountPaid,
              amountDue: nextAmountDue,
            },
          });
          if (invoiceUpdate.count !== 1) {
            throw apiError("CONFLICT", "Invoice was modified by another request. Retry void.");
          }
        }

        const now = new Date();
        await tx.outletPaymentReversal.create({
          data: {
            paymentId: payment.id,
            outletId: payment.outletId,
            amount: payment.amount,
            reason: input.reason,
            reversedById: ctx.actor.id,
            reversedAt: now,
          },
        });

        await tx.outletPayment.update({
          where: { id: payment.id },
          data: {
            voidedAt: now,
            voidedById: ctx.actor.id,
            voidReason: input.reason,
          },
        });

        // Post the reversing journal: Dr Debtors (outlet) · Cr Bank
        await postPaymentReversed(tx, {
          paymentId: payment.id,
          reference: payment.reference ?? payment.id,
          outletId: payment.outletId,
          reversedAt: now,
          amount: payment.amount,
          postedById: ctx.actor.id,
        });

        const aggregate = await tx.invoice.aggregate({
          where: { outletId: payment.outletId },
          _sum: { amountDue: true },
        });

        await tx.outlet.update({
          where: { id: payment.outletId },
          data: {
            outstandingBalance: aggregate._sum.amountDue ?? new Prisma.Decimal(0),
          },
        });

        return tx.outletPayment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { allocations: true, reversal: true },
        });
      });

      return toPaymentItem(voided);
    }),
});
