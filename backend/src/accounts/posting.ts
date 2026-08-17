import { Prisma } from "@prisma/client";
import type { JournalSourceType } from "@prisma/client";
import { ACCOUNT_CODES, type AccountCode } from "./chart-of-accounts";

// ---------------------------------------------------------------------------
// Drafts — pure, DB-free representations of a balanced journal entry.
// The pure builders below are the correctness core; they are unit-tested for
// the debits==credits invariant without touching a database.
// ---------------------------------------------------------------------------

export type JournalLineDraft = {
  code: AccountCode;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  outletId?: string | null;
  memo?: string;
};

export type JournalDraft = {
  narration: string;
  sourceType: JournalSourceType;
  lines: JournalLineDraft[];
};

const ZERO = new Prisma.Decimal(0);

function dr(code: AccountCode, amount: Prisma.Decimal, extra?: { outletId?: string | null; memo?: string }): JournalLineDraft {
  return { code, debit: amount, credit: ZERO, ...extra };
}

function cr(code: AccountCode, amount: Prisma.Decimal, extra?: { outletId?: string | null; memo?: string }): JournalLineDraft {
  return { code, debit: ZERO, credit: amount, ...extra };
}

/**
 * Guarantees a draft is a valid double-entry: total debits == total credits and
 * every line is one-sided (exactly one of debit/credit is > 0). Throws otherwise.
 * Every builder runs this so an unbalanced entry can never reach the database.
 */
export function assertBalanced(draft: JournalDraft): JournalDraft {
  let debits = ZERO;
  let credits = ZERO;
  for (const line of draft.lines) {
    if (line.debit.lt(0) || line.credit.lt(0)) {
      throw new Error(`[ledger] negative amount on ${line.code} in "${draft.narration}"`);
    }
    if (line.debit.gt(0) && line.credit.gt(0)) {
      throw new Error(`[ledger] line ${line.code} has both debit and credit in "${draft.narration}"`);
    }
    debits = debits.add(line.debit);
    credits = credits.add(line.credit);
  }
  if (!debits.equals(credits)) {
    throw new Error(
      `[ledger] unbalanced entry "${draft.narration}": debits ${debits.toString()} != credits ${credits.toString()}`,
    );
  }
  if (debits.lte(0)) {
    throw new Error(`[ledger] empty/zero entry "${draft.narration}"`);
  }
  return draft;
}

// ---------------------------------------------------------------------------
// GST place-of-supply split
// ---------------------------------------------------------------------------

export type GstSplit = { cgst: Prisma.Decimal; sgst: Prisma.Decimal; igst: Prisma.Decimal };

/**
 * Splits a total GST amount into CGST/SGST (intra-state) or IGST (inter-state).
 * For intra-state, CGST takes the rounded half and SGST the remainder so the two
 * always sum back to the exact total (no rounding drift).
 */
export function splitGst(gstTotal: Prisma.Decimal, interState: boolean): GstSplit {
  if (gstTotal.lte(0)) {
    return { cgst: ZERO, sgst: ZERO, igst: ZERO };
  }
  if (interState) {
    return { cgst: ZERO, sgst: ZERO, igst: gstTotal };
  }
  const cgst = gstTotal.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const sgst = gstTotal.sub(cgst);
  return { cgst, sgst, igst: ZERO };
}

// ---------------------------------------------------------------------------
// Pure builders — one per business event
// ---------------------------------------------------------------------------

export function buildInvoiceJournal(input: {
  invoiceNumber: string;
  outletId: string;
  sales: Prisma.Decimal; // taxable subtotal (subtotal - discount) = revenue
  gst: GstSplit;
  total: Prisma.Decimal;
}): JournalDraft {
  const lines: JournalLineDraft[] = [
    dr(ACCOUNT_CODES.debtors, input.total, { outletId: input.outletId }),
    cr(ACCOUNT_CODES.salesBatteries, input.sales),
  ];
  if (input.gst.cgst.gt(0)) lines.push(cr(ACCOUNT_CODES.gstOutputCgst, input.gst.cgst));
  if (input.gst.sgst.gt(0)) lines.push(cr(ACCOUNT_CODES.gstOutputSgst, input.gst.sgst));
  if (input.gst.igst.gt(0)) lines.push(cr(ACCOUNT_CODES.gstOutputIgst, input.gst.igst));
  return assertBalanced({
    narration: `Invoice ${input.invoiceNumber}`,
    sourceType: "INVOICE",
    lines,
  });
}

export function buildPaymentJournal(input: {
  reference: string;
  outletId: string;
  amount: Prisma.Decimal;
}): JournalDraft {
  return assertBalanced({
    narration: `Payment received ${input.reference}`,
    sourceType: "PAYMENT",
    lines: [
      dr(ACCOUNT_CODES.bank, input.amount),
      cr(ACCOUNT_CODES.debtors, input.amount, { outletId: input.outletId }),
    ],
  });
}

export function buildPaymentReversalJournal(input: {
  reference: string;
  outletId: string;
  amount: Prisma.Decimal;
}): JournalDraft {
  return assertBalanced({
    narration: `Payment voided ${input.reference}`,
    sourceType: "PAYMENT_REVERSAL",
    lines: [
      dr(ACCOUNT_CODES.debtors, input.amount, { outletId: input.outletId }),
      cr(ACCOUNT_CODES.bank, input.amount),
    ],
  });
}

// ---------------------------------------------------------------------------
// DB layer — resolve place-of-supply, generate numbers, persist drafts
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/**
 * Determines whether a sale to `outletId` is inter-state for GST purposes by
 * comparing the seller's state (the serving warehouse's billing profile) to the
 * buyer's (the outlet's billing profile). Defaults to intra-state (CGST+SGST)
 * when either state is unknown — the trial balance stays correct regardless.
 */
export async function resolvePlaceOfSupply(
  tx: Tx,
  outletId: string,
): Promise<{ interState: boolean; sellerStateCode: string | null; buyerStateCode: string | null }> {
  const outlet = await tx.outlet.findUnique({
    where: { id: outletId },
    select: {
      billingProfile: { select: { stateCode: true } },
      warehouse: { select: { billingProfile: { select: { stateCode: true } } } },
    },
  });
  const buyerStateCode = outlet?.billingProfile?.stateCode ?? null;
  const sellerStateCode = outlet?.warehouse?.billingProfile?.stateCode ?? null;
  const interState =
    buyerStateCode !== null && sellerStateCode !== null && buyerStateCode !== sellerStateCode;
  return { interState, sellerStateCode, buyerStateCode };
}

async function resolveAccountIds(tx: Tx, codes: string[]): Promise<Map<string, string>> {
  const accounts = await tx.ledgerAccount.findMany({
    where: { code: { in: Array.from(new Set(codes)) } },
    select: { id: true, code: true },
  });
  const map = new Map(accounts.map((a) => [a.code, a.id]));
  for (const code of codes) {
    if (!map.has(code)) {
      throw new Error(`[ledger] account code ${code} missing — seed the chart of accounts first`);
    }
  }
  return map;
}

async function nextEntryNumber(tx: Tx, entryDate: Date): Promise<string> {
  const year = entryDate.getUTCFullYear();
  const seq = await tx.journalSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return `JE-${year}-${String(seq.lastSequence).padStart(6, "0")}`;
}

/** True if a journal entry already exists for this source — used for idempotency. */
export async function hasJournalFor(tx: Tx, sourceType: JournalSourceType, sourceId: string): Promise<boolean> {
  const existing = await tx.journalEntry.findFirst({
    where: { sourceType, sourceId },
    select: { id: true },
  });
  return existing !== null;
}

export async function persistJournal(
  tx: Tx,
  draft: JournalDraft,
  opts: { entryDate: Date; sourceId?: string | null; reversalOfId?: string | null; postedById?: string | null },
): Promise<string> {
  assertBalanced(draft);
  const accountIds = await resolveAccountIds(tx, draft.lines.map((l) => l.code));
  const entryNumber = await nextEntryNumber(tx, opts.entryDate);
  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: opts.entryDate,
      narration: draft.narration,
      sourceType: draft.sourceType,
      sourceId: opts.sourceId ?? null,
      reversalOfId: opts.reversalOfId ?? null,
      postedById: opts.postedById ?? null,
      lines: {
        create: draft.lines.map((l) => ({
          accountId: accountIds.get(l.code)!,
          debit: l.debit,
          credit: l.credit,
          outletId: l.outletId ?? null,
          memo: l.memo ?? null,
        })),
      },
    },
    select: { id: true },
  });
  return entry.id;
}

// ---------------------------------------------------------------------------
// High-level posting functions — called from operational flows (same tx)
// Each is idempotent per source document, so backfill/retries are safe.
// ---------------------------------------------------------------------------

export async function postInvoiceCreated(
  tx: Tx,
  input: {
    invoiceId: string;
    invoiceNumber: string;
    outletId: string;
    invoiceDate: Date;
    sales: Prisma.Decimal;
    gstTotal: Prisma.Decimal;
    total: Prisma.Decimal;
    postedById?: string | null;
  },
): Promise<string | null> {
  // Zero-value invoices (e.g. 100%-discounted warranty replacements) have no
  // ledger impact — they add 0 to both the GL and the AR subledger.
  if (input.total.lte(0)) return null;
  if (await hasJournalFor(tx, "INVOICE", input.invoiceId)) return null;
  const { interState } = await resolvePlaceOfSupply(tx, input.outletId);
  const draft = buildInvoiceJournal({
    invoiceNumber: input.invoiceNumber,
    outletId: input.outletId,
    sales: input.sales,
    gst: splitGst(input.gstTotal, interState),
    total: input.total,
  });
  return persistJournal(tx, draft, {
    entryDate: input.invoiceDate,
    sourceId: input.invoiceId,
    postedById: input.postedById,
  });
}

export async function postPaymentReceived(
  tx: Tx,
  input: {
    paymentId: string;
    reference: string;
    outletId: string;
    paymentDate: Date;
    amount: Prisma.Decimal;
    postedById?: string | null;
  },
): Promise<string | null> {
  if (await hasJournalFor(tx, "PAYMENT", input.paymentId)) return null;
  const draft = buildPaymentJournal({
    reference: input.reference,
    outletId: input.outletId,
    amount: input.amount,
  });
  return persistJournal(tx, draft, {
    entryDate: input.paymentDate,
    sourceId: input.paymentId,
    postedById: input.postedById,
  });
}

export async function postPaymentReversed(
  tx: Tx,
  input: {
    paymentId: string;
    reference: string;
    outletId: string;
    reversedAt: Date;
    amount: Prisma.Decimal;
    postedById?: string | null;
  },
): Promise<string | null> {
  if (await hasJournalFor(tx, "PAYMENT_REVERSAL", input.paymentId)) return null;
  // Link back to the original payment's journal entry, if it was posted.
  const original = await tx.journalEntry.findFirst({
    where: { sourceType: "PAYMENT", sourceId: input.paymentId },
    select: { id: true },
  });
  const draft = buildPaymentReversalJournal({
    reference: input.reference,
    outletId: input.outletId,
    amount: input.amount,
  });
  return persistJournal(tx, draft, {
    entryDate: input.reversedAt,
    sourceId: input.paymentId,
    reversalOfId: original?.id ?? null,
    postedById: input.postedById,
  });
}
