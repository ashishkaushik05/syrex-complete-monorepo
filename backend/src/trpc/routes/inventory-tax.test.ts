import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { calculateGoodsReceiptTax } from "./inventory";
import { decEq } from "./__testkit__";

// Phase 3 ASVF hardening (DEC-20260613-010). The procedure-level GRN flows are
// covered by the DB-integration suite (inventory.test.ts); this file pins the pure
// GST-split money invariant table-driven, no database required.

describe("calculateGoodsReceiptTax — same-state CGST/SGST split", () => {
  it("splits an 18% tax evenly into CGST + SGST and zeroes IGST (Happy)", () => {
    const out = calculateGoodsReceiptTax({
      quantity: 2,
      transferValue: 100,
      gstRate: 18,
      sourceStateCode: "29",
      destinationStateCode: "29",
    });
    expect(out.taxableValue.toString()).toBe("200");
    expect(out.cgstAmount.toString()).toBe("18");
    expect(out.sgstAmount.toString()).toBe("18");
    expect(out.igstAmount.toString()).toBe("0");
    expect(decEq(out.cgstRate, 9)).toBe(true);
    expect(decEq(out.sgstRate, 9)).toBe(true);
    expect(out.lineTotal.toString()).toBe("236");
  });

  it("rounds the taxable value and tax half-up to paise (edge)", () => {
    const out = calculateGoodsReceiptTax({
      quantity: 3,
      transferValue: "33.33",
      gstRate: 18,
      sourceStateCode: "29",
      destinationStateCode: "29",
    });
    // 33.33 × 3 = 99.99 taxable; 18% = 17.9982 → 18.00; split 9.00 / 9.00.
    expect(out.taxableValue.toString()).toBe("99.99");
    expect(out.cgstAmount.toString()).toBe("9");
    expect(out.sgstAmount.toString()).toBe("9");
    expect(out.lineTotal.toString()).toBe("117.99");
  });

  it.each([
    [1, "100", 18],
    [4, "57.55", 12],
    [7, "13.01", 5],
    [3, "999.99", 28],
  ])("CGST + SGST == total tax for qty=%p value=%p rate=%p (invariant)", (qty, value, rate) => {
    const out = calculateGoodsReceiptTax({
      quantity: qty,
      transferValue: value,
      gstRate: rate,
      sourceStateCode: "29",
      destinationStateCode: "29",
    });
    const totalTax = out.lineTotal.sub(out.taxableValue);
    // No paise is lost or invented when halving the tax.
    expect(decEq(out.cgstAmount.add(out.sgstAmount), totalTax)).toBe(true);
    expect(out.igstAmount.toString()).toBe("0");
  });
});

describe("calculateGoodsReceiptTax — interstate IGST", () => {
  it("charges full IGST and zeroes CGST/SGST (Happy)", () => {
    const out = calculateGoodsReceiptTax({
      quantity: 1,
      transferValue: 1000,
      gstRate: 18,
      sourceStateCode: "29",
      destinationStateCode: "27",
    });
    expect(out.igstAmount.toString()).toBe("180");
    expect(decEq(out.igstRate, 18)).toBe(true);
    expect(out.cgstAmount.toString()).toBe("0");
    expect(out.sgstAmount.toString()).toBe("0");
    expect(out.cgstRate.toString()).toBe("0");
    expect(out.lineTotal.toString()).toBe("1180");
  });

  it.each([
    [2, "250", 18],
    [5, "19.99", 12],
    [1, "0.50", 28],
  ])("IGST == total tax for qty=%p value=%p rate=%p (invariant)", (qty, value, rate) => {
    const out = calculateGoodsReceiptTax({
      quantity: qty,
      transferValue: value,
      gstRate: rate,
      sourceStateCode: "29",
      destinationStateCode: "07",
    });
    const totalTax = out.lineTotal.sub(out.taxableValue);
    expect(decEq(out.igstAmount, totalTax)).toBe(true);
    expect(out.cgstAmount.add(out.sgstAmount).equals(new Prisma.Decimal(0))).toBe(true);
  });
});

describe("calculateGoodsReceiptTax — degenerate inputs", () => {
  it("returns all-zero tax for a zero GST rate", () => {
    const out = calculateGoodsReceiptTax({
      quantity: 5,
      transferValue: 100,
      gstRate: 0,
      sourceStateCode: "29",
      destinationStateCode: "29",
    });
    expect(out.cgstAmount.toString()).toBe("0");
    expect(out.sgstAmount.toString()).toBe("0");
    expect(out.igstAmount.toString()).toBe("0");
    expect(out.lineTotal.toString()).toBe("500");
  });
});
