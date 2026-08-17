import { describe, expect, it } from "bun:test";
import { orgBillingProfileRouter } from "./org-billing-profile";
import { makeCtx } from "./__testkit__";

// ASVF for org-billing-profile (P1 — the legal/tax identity stamped onto every invoice).
// read behind billing:read, mutations behind billing:manage. The high-value surface here is
// validation asserted against FIXED expected values, not mock echoes: GSTIN/PAN/stateCode
// shapes, the GSTIN-prefix-must-equal-stateCode rule, and the company-only GRN-issuer rule.

const PROFILE_ID = "b1110000-0000-4000-8000-000000000001";

// A valid, internally consistent profile: GSTIN prefix "27" == stateCode "27".
const validInput = {
  legalName: "Acme Power Pvt Ltd",
  gstin: "27ABCDE1234F1Z5",
  pan: "ABCDE1234F",
  addressLine1: "1 Industrial Rd",
  city: "Mumbai",
  state: "Maharashtra",
  stateCode: "27",
  pincode: "400001",
  profileType: "company" as const,
};

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    legalName: "Acme Power Pvt Ltd",
    gstin: "27ABCDE1234F1Z5",
    pan: "ABCDE1234F",
    addressLine1: "1 Industrial Rd",
    addressLine2: null,
    city: "Mumbai",
    state: "Maharashtra",
    stateCode: "27",
    pincode: "400001",
    country: "India",
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    logoUrl: null,
    profileType: "company" as const,
    canIssueGrnInvoice: false,
    isActive: true,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

const defined = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

function billingPrisma(opts: { rows?: Record<string, unknown>[]; byId?: Record<string, unknown> | null; first?: Record<string, unknown> | null } = {}) {
  const captured: { create?: Record<string, unknown>; update?: Record<string, unknown> } = {};
  const prisma = {
    billingProfile: {
      findMany: async () => opts.rows ?? [],
      findUnique: async () => ("byId" in opts ? opts.byId ?? null : profileRow()),
      findFirst: async () => ("first" in opts ? opts.first ?? null : profileRow()),
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return profileRow(defined(args.data));
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return profileRow(defined(args.data));
      },
    },
  };
  return { prisma, captured };
}

const READ = ["billing:read"];
const MANAGE = ["billing:manage"];

describe("orgBillingProfile.list / getById", () => {
  it("rejects without billing:read (Auth)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.list()).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("maps legalName onto the companyName facade field", async () => {
    const { prisma } = billingPrisma({ rows: [profileRow()] });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    const out = await caller.list();
    expect(out[0].companyName).toBe("Acme Power Pvt Ltd");
  });

  it("getById returns NOT_FOUND when absent (Failure)", async () => {
    const { prisma } = billingPrisma({ byId: null });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.getById({ id: PROFILE_ID })).rejects.toThrow(/not found/i);
  });
});

describe("orgBillingProfile.create validation", () => {
  it("rejects without billing:manage (Auth)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.create(validInput)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects a malformed GSTIN (Validation)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.create({ ...validInput, gstin: "NOTAGSTIN" })).rejects.toThrow();
  });

  it("rejects a malformed PAN (Validation)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.create({ ...validInput, pan: "BADPAN" })).rejects.toThrow();
  });

  it("rejects a 6-digit-fail pincode (Validation)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.create({ ...validInput, pincode: "12" })).rejects.toThrow();
  });

  it("rejects a GSTIN whose prefix does not match the state code (Failure)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    // GSTIN prefix 27, stateCode 29 → mismatch
    await expect(caller.create({ ...validInput, stateCode: "29" })).rejects.toThrow(/prefix must match state code/i);
  });

  it("rejects a non-company profile that claims GRN-invoice issuance (Failure)", async () => {
    const { prisma } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(
      caller.create({ ...validInput, profileType: "warehouse", canIssueGrnInvoice: true }),
    ).rejects.toThrow(/Only company profiles can issue GRN invoices/i);
  });

  it("creates a consistent company profile", async () => {
    const { prisma, captured } = billingPrisma();
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    const out = await caller.create(validInput);
    expect(captured.create!.gstin).toBe("27ABCDE1234F1Z5");
    expect(out.profileType).toBe("company");
  });
});

describe("orgBillingProfile.update", () => {
  it("returns NOT_FOUND for a missing profile (Failure)", async () => {
    const { prisma } = billingPrisma({ byId: null });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await expect(caller.update({ id: PROFILE_ID, legalName: "X" })).rejects.toThrow(/not found/i);
  });

  it("re-checks the GSTIN/state rule using the merged existing+patch values", async () => {
    const { prisma } = billingPrisma({ byId: profileRow({ stateCode: "27", gstin: "27ABCDE1234F1Z5" }) });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    // patch only the stateCode to a value inconsistent with the stored GSTIN prefix
    await expect(caller.update({ id: PROFILE_ID, stateCode: "29" })).rejects.toThrow(/prefix must match state code/i);
  });
});

describe("orgBillingProfile.get / upsert", () => {
  it("get returns NOT_FOUND when no active company profile exists (Failure)", async () => {
    const { prisma } = billingPrisma({ first: null });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: READ, prisma }));
    await expect(caller.get()).rejects.toThrow(/No active company billing profile/i);
  });

  it("upsert creates when no company profile exists yet", async () => {
    const { prisma, captured } = billingPrisma({ first: null });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await caller.upsert({
      companyName: "Acme Power Pvt Ltd",
      addressLine1: "1 Industrial Rd",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
    });
    // stateCode is derived from the GSTIN prefix, GRN issuance forced on for the company profile
    expect(captured.create!.stateCode).toBe("27");
    expect(captured.create!.canIssueGrnInvoice).toBe(true);
    expect(captured.create!.profileType).toBe("company");
  });

  it("upsert updates the existing company profile in place", async () => {
    const { prisma, captured } = billingPrisma({ first: profileRow() });
    const caller = orgBillingProfileRouter.createCaller(makeCtx({ permissions: MANAGE, prisma }));
    await caller.upsert({
      companyName: "Renamed Co",
      addressLine1: "2 New Rd",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
    });
    expect(captured.update!.legalName).toBe("Renamed Co");
    expect(captured.create).toBeUndefined();
  });
});
