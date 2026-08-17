import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  assertBalanced,
  buildInvoiceJournal,
  buildPaymentJournal,
  buildPaymentReversalJournal,
  splitGst,
  type JournalDraft,
} from "./posting";

const D = (v: string | number) => new Prisma.Decimal(v);
const OUTLET = "11111111-1111-4111-8111-111111111111";

function sums(draft: JournalDraft) {
  let debit = D(0);
  let credit = D(0);
  for (const line of draft.lines) {
    debit = debit.add(line.debit);
    credit = credit.add(line.credit);
  }
  return { debit, credit };
}

describe("splitGst", () => {
  it("intra-state splits into equal CGST + SGST that sum back exactly", () => {
    const { cgst, sgst, igst } = splitGst(D("180.00"), false);
    expect(cgst.toFixed(2)).toBe("90.00");
    expect(sgst.toFixed(2)).toBe("90.00");
    expect(igst.toFixed(2)).toBe("0.00");
    expect(cgst.add(sgst).toFixed(2)).toBe("180.00");
  });

  it("odd amounts have no rounding drift (CGST + SGST == total)", () => {
    const total = D("100.01");
    const { cgst, sgst } = splitGst(total, false);
    expect(cgst.add(sgst).equals(total)).toBe(true);
  });

  it("inter-state puts the full amount in IGST", () => {
    const { cgst, sgst, igst } = splitGst(D("180.00"), true);
    expect(cgst.toFixed(2)).toBe("0.00");
    expect(sgst.toFixed(2)).toBe("0.00");
    expect(igst.toFixed(2)).toBe("180.00");
  });

  it("zero GST yields all zeros", () => {
    const { cgst, sgst, igst } = splitGst(D(0), false);
    expect(cgst.add(sgst).add(igst).toFixed(2)).toBe("0.00");
  });
});

describe("pure journal builders are always balanced", () => {
  it("invoice (intra-state): Dr Debtors = Cr Sales + CGST + SGST", () => {
    const draft = buildInvoiceJournal({
      invoiceNumber: "INV-2026-000001",
      outletId: OUTLET,
      sales: D("1000.00"),
      gst: splitGst(D("180.00"), false),
      total: D("1180.00"),
    });
    const { debit, credit } = sums(draft);
    expect(debit.equals(credit)).toBe(true);
    expect(debit.toFixed(2)).toBe("1180.00");
    // Debtors line carries the outlet party tag for subledger reconciliation.
    const debtors = draft.lines.find((l) => l.debit.gt(0));
    expect(debtors?.outletId).toBe(OUTLET);
  });

  it("invoice (inter-state): uses a single IGST credit line", () => {
    const draft = buildInvoiceJournal({
      invoiceNumber: "INV-2026-000002",
      outletId: OUTLET,
      sales: D("1000.00"),
      gst: splitGst(D("180.00"), true),
      total: D("1180.00"),
    });
    expect(sums(draft).debit.equals(sums(draft).credit)).toBe(true);
    expect(draft.lines.filter((l) => l.credit.gt(0)).length).toBe(2); // Sales + IGST
  });

  it("invoice with zero GST posts only Debtors + Sales", () => {
    const draft = buildInvoiceJournal({
      invoiceNumber: "INV-2026-000003",
      outletId: OUTLET,
      sales: D("500.00"),
      gst: splitGst(D(0), false),
      total: D("500.00"),
    });
    expect(draft.lines.length).toBe(2);
    expect(sums(draft).debit.equals(sums(draft).credit)).toBe(true);
  });

  it("payment: Dr Bank = Cr Debtors", () => {
    const draft = buildPaymentJournal({ reference: "PAY-1", outletId: OUTLET, amount: D("750.50") });
    expect(sums(draft).debit.toFixed(2)).toBe("750.50");
    expect(sums(draft).debit.equals(sums(draft).credit)).toBe(true);
  });

  it("payment reversal mirrors the payment", () => {
    const draft = buildPaymentReversalJournal({ reference: "PAY-1", outletId: OUTLET, amount: D("750.50") });
    expect(sums(draft).debit.equals(sums(draft).credit)).toBe(true);
    // Debit now on Debtors (unwinds the receivable credit from the payment).
    const debit = draft.lines.find((l) => l.debit.gt(0));
    expect(debit?.outletId).toBe(OUTLET);
  });
});

describe("assertBalanced rejects invalid entries", () => {
  it("throws when debits != credits", () => {
    expect(() =>
      assertBalanced({
        narration: "bad",
        sourceType: "MANUAL",
        lines: [
          { code: "1200" as never, debit: D("100"), credit: D(0) },
          { code: "4100" as never, debit: D(0), credit: D("90") },
        ],
      }),
    ).toThrow(/unbalanced/);
  });

  it("throws when a line has both debit and credit", () => {
    expect(() =>
      assertBalanced({
        narration: "bad",
        sourceType: "MANUAL",
        lines: [{ code: "1200" as never, debit: D("100"), credit: D("100") }],
      }),
    ).toThrow(/both debit and credit/);
  });

  it("throws on an all-zero entry", () => {
    expect(() =>
      assertBalanced({
        narration: "empty",
        sourceType: "MANUAL",
        lines: [
          { code: "1200" as never, debit: D(0), credit: D(0) },
          { code: "4100" as never, debit: D(0), credit: D(0) },
        ],
      }),
    ).toThrow(/empty\/zero/);
  });
});
