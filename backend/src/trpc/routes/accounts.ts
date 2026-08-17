import { Prisma } from "@prisma/client";
import { z } from "zod";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { createTRPCRouter, perm, permAny } from "../trpc";
import { assertOutletWarehouseScope, resolveFinancialScope } from "./outlet-access";
import { assertBalanced, persistJournal, type JournalLineDraft } from "../../accounts/posting";
import type { AccountCode } from "../../accounts/chart-of-accounts";

const statementRowSchema = z.object({
  id: z.string(),
  kind: z.enum(["invoice", "payment", "payment_reversal"]),
  happenedAt: z.string(),
  reference: z.string(),
  description: z.string().nullable(),
  debit: z.string(),
  credit: z.string(),
  runningBalance: z.string(),
  invoiceId: z.string().nullable(),
  paymentId: z.string().nullable(),
});

const statementSchema = z.object({
  outlet: z.object({
    id: z.string(),
    outletCode: z.string(),
    name: z.string(),
  }),
  from: z.string(),
  to: z.string(),
  openingBalance: z.string(),
  closingBalance: z.string(),
  totalInvoiced: z.string(),
  totalReceived: z.string(),
  totalReversed: z.string(),
  rows: z.array(statementRowSchema),
});

type StatementTxn = {
  id: string;
  kind: "invoice" | "payment" | "payment_reversal";
  happenedAt: Date;
  reference: string;
  description: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  invoiceId: string | null;
  paymentId: string | null;
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function inRange(date: Date, from: Date, to: Date) {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

async function assertStatementScope(ctx: {
  prisma: any;
  actor: { id: string | null };
  permissions: string[];
  managedWarehouseId: string | null;
}, outletId: string) {
  const { linkedOutletId, isWarehouseScoped } = resolveFinancialScope(ctx as any, {
    errorMessage: "No safe accounts scope available",
  });
  if (linkedOutletId && linkedOutletId !== outletId) {
    throw apiError("FORBIDDEN", "Access denied to this outlet");
  }
  if (isWarehouseScoped) {
    await assertOutletWarehouseScope(ctx as any, outletId);
  }
}

export const accountsRouter = createTRPCRouter({
  statement: permAny(P.invoices.read, P.payments.read)
    .input(
      z.object({
        outletId: z.string().uuid(),
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
    )
    .output(statementSchema)
    .query(async ({ ctx, input }) => {
      if (
        !ctx.permissions.includes(SUPER_ADMIN_PERMISSION) &&
        (!ctx.permissions.includes(P.invoices.read) || !ctx.permissions.includes(P.payments.read))
      ) {
        throw apiError("FORBIDDEN", `Requires: ${P.invoices.read} and ${P.payments.read}`);
      }

      const from = new Date(input.from);
      const to = new Date(input.to);
      if (from.getTime() > to.getTime()) {
        throw apiError("BAD_REQUEST", "from must be before or equal to to");
      }

      await assertStatementScope(ctx, input.outletId);

      const outlet = await ctx.prisma.outlet.findUnique({
        where: { id: input.outletId },
        select: { id: true, outletCode: true, name: true },
      });
      if (!outlet) {
        throw apiError("NOT_FOUND", "Outlet not found");
      }

      const [invoices, payments, reversals] = await Promise.all([
        ctx.prisma.invoice.findMany({
          where: { outletId: input.outletId, invoiceDate: { lte: to } },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            total: true,
          },
        }),
        ctx.prisma.outletPayment.findMany({
          where: { outletId: input.outletId, paymentDate: { lte: to } },
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            reference: true,
            description: true,
          },
        }),
        ctx.prisma.outletPaymentReversal.findMany({
          where: { outletId: input.outletId, reversedAt: { lte: to } },
          select: {
            id: true,
            paymentId: true,
            amount: true,
            reason: true,
            reversedAt: true,
          },
        }),
      ]);

      const txns: StatementTxn[] = [
        ...invoices.map((invoice) => ({
          id: invoice.id,
          kind: "invoice" as const,
          happenedAt: invoice.invoiceDate,
          reference: invoice.invoiceNumber,
          description: invoice.dueDate ? `Due ${invoice.dueDate.toISOString().slice(0, 10)}` : null,
          debit: invoice.total,
          credit: decimal(0),
          invoiceId: invoice.id,
          paymentId: null,
        })),
        ...payments.map((payment) => ({
          id: payment.id,
          kind: "payment" as const,
          happenedAt: payment.paymentDate,
          reference: payment.reference ?? payment.id,
          description: payment.description,
          debit: decimal(0),
          credit: payment.amount,
          invoiceId: null,
          paymentId: payment.id,
        })),
        ...reversals.map((reversal) => ({
          id: reversal.id,
          kind: "payment_reversal" as const,
          happenedAt: reversal.reversedAt,
          reference: `VOID ${reversal.paymentId}`,
          description: reversal.reason,
          debit: reversal.amount,
          credit: decimal(0),
          invoiceId: null,
          paymentId: reversal.paymentId,
        })),
      ].sort((a, b) => {
        const byDate = a.happenedAt.getTime() - b.happenedAt.getTime();
        if (byDate !== 0) return byDate;
        return a.id.localeCompare(b.id);
      });

      const openingBalance = txns
        .filter((txn) => txn.happenedAt.getTime() < from.getTime())
        .reduce((balance, txn) => balance.add(txn.debit).sub(txn.credit), decimal(0));

      let runningBalance = openingBalance;
      let totalInvoiced = decimal(0);
      let totalReceived = decimal(0);
      let totalReversed = decimal(0);

      const rows = txns
        .filter((txn) => inRange(txn.happenedAt, from, to))
        .map((txn) => {
          runningBalance = runningBalance.add(txn.debit).sub(txn.credit);
          if (txn.kind === "invoice") totalInvoiced = totalInvoiced.add(txn.debit);
          if (txn.kind === "payment") totalReceived = totalReceived.add(txn.credit);
          if (txn.kind === "payment_reversal") totalReversed = totalReversed.add(txn.debit);

          return {
            id: txn.id,
            kind: txn.kind,
            happenedAt: txn.happenedAt.toISOString(),
            reference: txn.reference,
            description: txn.description,
            debit: txn.debit.toFixed(2),
            credit: txn.credit.toFixed(2),
            runningBalance: runningBalance.toFixed(2),
            invoiceId: txn.invoiceId,
            paymentId: txn.paymentId,
          };
        });

      return {
        outlet,
        from: from.toISOString(),
        to: to.toISOString(),
        openingBalance: openingBalance.toFixed(2),
        closingBalance: runningBalance.toFixed(2),
        totalInvoiced: totalInvoiced.toFixed(2),
        totalReceived: totalReceived.toFixed(2),
        totalReversed: totalReversed.toFixed(2),
        rows,
      };
    }),

  // -------------------------------------------------------------------------
  // General Ledger — chart of accounts, trial balance, journal, manual entries
  // -------------------------------------------------------------------------

  chartOfAccounts: perm(P.accounts.read)
    .output(
      z.array(
        z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
          parentId: z.string().nullable(),
          isPostable: z.boolean(),
          isActive: z.boolean(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const accounts = await ctx.prisma.ledgerAccount.findMany({
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, type: true, parentId: true, isPostable: true, isActive: true },
      });
      return accounts;
    }),

  trialBalance: perm(P.accounts.read)
    .input(z.object({ asOf: z.string().datetime().optional() }))
    .output(
      z.object({
        asOf: z.string(),
        rows: z.array(
          z.object({
            code: z.string(),
            name: z.string(),
            type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
            debit: z.string(),
            credit: z.string(),
            balance: z.string(),
          }),
        ),
        totalDebit: z.string(),
        totalCredit: z.string(),
        balanced: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const asOf = input.asOf ? new Date(input.asOf) : new Date();

      const lines = await ctx.prisma.journalLine.findMany({
        where: { entry: { entryDate: { lte: asOf } } },
        select: {
          debit: true,
          credit: true,
          account: { select: { code: true, name: true, type: true } },
        },
      });

      const byAccount = new Map<
        string,
        { code: string; name: string; type: string; debit: Prisma.Decimal; credit: Prisma.Decimal }
      >();
      for (const line of lines) {
        const key = line.account.code;
        const row =
          byAccount.get(key) ??
          { code: line.account.code, name: line.account.name, type: line.account.type, debit: decimal(0), credit: decimal(0) };
        row.debit = row.debit.add(line.debit);
        row.credit = row.credit.add(line.credit);
        byAccount.set(key, row);
      }

      let totalDebit = decimal(0);
      let totalCredit = decimal(0);
      const rows = Array.from(byAccount.values())
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((row) => {
          totalDebit = totalDebit.add(row.debit);
          totalCredit = totalCredit.add(row.credit);
          return {
            code: row.code,
            name: row.name,
            type: row.type as "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE",
            debit: row.debit.toFixed(2),
            credit: row.credit.toFixed(2),
            balance: row.debit.sub(row.credit).toFixed(2),
          };
        });

      return {
        asOf: asOf.toISOString(),
        rows,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        balanced: totalDebit.equals(totalCredit),
      };
    }),

  journal: perm(P.accounts.read)
    .input(
      z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        sourceType: z
          .enum(["INVOICE", "PAYMENT", "PAYMENT_REVERSAL", "EXCHANGE", "WARRANTY", "SCRAP", "MANUAL", "OPENING"])
          .optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      if (from.getTime() > to.getTime()) {
        throw apiError("BAD_REQUEST", "from must be before or equal to to");
      }
      const entries = await ctx.prisma.journalEntry.findMany({
        where: {
          entryDate: { gte: from, lte: to },
          ...(input.sourceType ? { sourceType: input.sourceType } : {}),
        },
        orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
        take: input.limit,
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          narration: true,
          sourceType: true,
          sourceId: true,
          lines: {
            select: {
              debit: true,
              credit: true,
              outletId: true,
              account: { select: { code: true, name: true } },
            },
          },
        },
      });
      return entries.map((entry) => ({
        id: entry.id,
        entryNumber: entry.entryNumber,
        entryDate: entry.entryDate.toISOString(),
        narration: entry.narration,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        lines: entry.lines.map((line) => ({
          code: line.account.code,
          name: line.account.name,
          debit: line.debit.toFixed(2),
          credit: line.credit.toFixed(2),
          outletId: line.outletId,
        })),
      }));
    }),

  postManualEntry: perm(P.accounts.write)
    .input(
      z.object({
        entryDate: z.string().datetime(),
        narration: z.string().min(1).max(500),
        lines: z
          .array(
            z.object({
              code: z.string(),
              debit: z.string().default("0"),
              credit: z.string().default("0"),
              outletId: z.string().uuid().nullable().optional(),
              memo: z.string().max(300).optional(),
            }),
          )
          .min(2),
      }),
    )
    .output(z.object({ entryId: z.string(), entryNumber: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) {
        throw apiError("UNAUTHORIZED", "Actor required");
      }

      // Only postable, active accounts may receive manual entries.
      const codes = Array.from(new Set(input.lines.map((l) => l.code)));
      const accounts = await ctx.prisma.ledgerAccount.findMany({
        where: { code: { in: codes } },
        select: { code: true, isPostable: true, isActive: true },
      });
      const accountByCode = new Map(accounts.map((a) => [a.code, a]));
      for (const code of codes) {
        const acc = accountByCode.get(code);
        if (!acc) throw apiError("BAD_REQUEST", `Unknown account code: ${code}`);
        if (!acc.isPostable) throw apiError("BAD_REQUEST", `Account ${code} is a header account and cannot be posted to`);
        if (!acc.isActive) throw apiError("BAD_REQUEST", `Account ${code} is inactive`);
      }

      const draftLines: JournalLineDraft[] = input.lines.map((l) => ({
        code: l.code as AccountCode,
        debit: decimal(l.debit),
        credit: decimal(l.credit),
        outletId: l.outletId ?? null,
        memo: l.memo,
      }));
      // Validates the double-entry invariant before anything is written.
      const draft = assertBalanced({ narration: input.narration, sourceType: "MANUAL", lines: draftLines });

      const actorId = ctx.actor.id;
      const result = await ctx.prisma.$transaction(async (tx) => {
        const entryId = await persistJournal(tx, draft, {
          entryDate: new Date(input.entryDate),
          sourceId: null,
          postedById: actorId,
        });
        const entry = await tx.journalEntry.findUniqueOrThrow({
          where: { id: entryId },
          select: { entryNumber: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "accounts.postManualEntry",
            entityType: "JournalEntry",
            entityId: entryId,
            meta: { entryNumber: entry.entryNumber, narration: input.narration, lineCount: draftLines.length },
          },
        });
        return { entryId, entryNumber: entry.entryNumber };
      });

      return result;
    }),
});
