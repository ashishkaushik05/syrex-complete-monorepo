// One-time backfill: replays existing invoices, payments, and payment reversals
// through the posting engine so historical documents land in the general ledger.
// Idempotent — each posting function skips a source that already has a journal
// entry, so this script is safe to re-run.
//
//   bun run scripts/backfill-ledger.ts
//
// Requires the chart of accounts to be seeded first (scripts/seed-chart-of-accounts.ts).
import { PrismaClient, Prisma } from "@prisma/client";
import {
  postInvoiceCreated,
  postPaymentReceived,
  postPaymentReversed,
} from "../src/accounts/posting";

async function main() {
  const prisma = new PrismaClient();
  const counts = { invoices: 0, payments: 0, reversals: 0, skipped: 0 };
  try {
    // 1. Invoices (chronological, for stable entry numbering)
    const invoices = await prisma.invoice.findMany({
      orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
      select: {
        id: true,
        invoiceNumber: true,
        outletId: true,
        invoiceDate: true,
        subtotal: true,
        discountAmount: true,
        total: true,
      },
    });
    for (const inv of invoices) {
      const sales = inv.subtotal.sub(inv.discountAmount); // taxable subtotal = revenue
      const gstTotal = inv.total.sub(sales); // = sum of invoice charges
      const posted = await prisma.$transaction((tx) =>
        postInvoiceCreated(tx, {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          outletId: inv.outletId,
          invoiceDate: inv.invoiceDate,
          sales,
          gstTotal: Prisma.Decimal.max(new Prisma.Decimal(0), gstTotal),
          total: inv.total,
        }),
      );
      posted ? counts.invoices++ : counts.skipped++;
    }

    // 2. Payments
    const payments = await prisma.outletPayment.findMany({
      orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
      select: { id: true, outletId: true, amount: true, paymentDate: true, reference: true },
    });
    for (const pay of payments) {
      const posted = await prisma.$transaction((tx) =>
        postPaymentReceived(tx, {
          paymentId: pay.id,
          reference: pay.reference ?? pay.id,
          outletId: pay.outletId,
          paymentDate: pay.paymentDate,
          amount: pay.amount,
        }),
      );
      posted ? counts.payments++ : counts.skipped++;
    }

    // 3. Payment reversals
    const reversals = await prisma.outletPaymentReversal.findMany({
      orderBy: [{ reversedAt: "asc" }, { id: "asc" }],
      select: {
        paymentId: true,
        outletId: true,
        amount: true,
        reversedAt: true,
        payment: { select: { reference: true } },
      },
    });
    for (const rev of reversals) {
      const posted = await prisma.$transaction((tx) =>
        postPaymentReversed(tx, {
          paymentId: rev.paymentId,
          reference: rev.payment.reference ?? rev.paymentId,
          outletId: rev.outletId,
          reversedAt: rev.reversedAt,
          amount: rev.amount,
        }),
      );
      posted ? counts.reversals++ : counts.skipped++;
    }

    console.log(
      `[backfill] posted invoices=${counts.invoices} payments=${counts.payments} reversals=${counts.reversals} (skipped already-posted=${counts.skipped})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
