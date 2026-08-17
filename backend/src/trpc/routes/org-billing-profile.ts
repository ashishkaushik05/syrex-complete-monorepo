import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";

const gstinSchema = z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN");
const panSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN");
const stateCodeSchema = z.string().regex(/^[0-9]{2}$/, "State code must be two digits");

const billingProfileSchema = z.object({
  id: z.string(),
  legalName: z.string(),
  companyName: z.string(),
  gstin: z.string(),
  pan: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  stateCode: z.string(),
  pincode: z.string(),
  country: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  logoUrl: z.string().nullable(),
  profileType: z.enum(["company", "warehouse", "outlet"]),
  canIssueGrnInvoice: z.boolean(),
  isActive: z.boolean(),
  sacCode: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const profileInputSchema = z.object({
  legalName: z.string().trim().min(1),
  gstin: gstinSchema,
  pan: panSchema,
  addressLine1: z.string().trim().min(1),
  addressLine2: z.string().trim().nullable().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  stateCode: stateCodeSchema,
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "Pincode must be six digits"),
  country: z.string().trim().min(1).default("India"),
  contactName: z.string().trim().nullable().optional(),
  contactPhone: z.string().trim().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  profileType: z.enum(["company", "warehouse", "outlet"]),
  canIssueGrnInvoice: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

function toProfile(row: {
  id: string;
  legalName: string;
  gstin: string;
  pan: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  country: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  logoUrl: string | null;
  profileType: "company" | "warehouse" | "outlet";
  canIssueGrnInvoice: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    companyName: row.legalName,
    sacCode: "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const orgBillingProfileRouter = createTRPCRouter({
  list: perm(P.billing.read)
    .input(z.object({
      profileType: z.enum(["company", "warehouse", "outlet"]).optional(),
      isActive: z.boolean().optional(),
    }).optional())
    .output(z.array(billingProfileSchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.billingProfile.findMany({
        where: { profileType: input?.profileType, isActive: input?.isActive },
        orderBy: [{ legalName: "asc" }, { id: "asc" }],
      });
      return rows.map(toProfile);
    }),

  getById: perm(P.billing.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(billingProfileSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.prisma.billingProfile.findUnique({ where: { id: input.id } });
      if (!row) throw apiError("NOT_FOUND", "Billing profile not found");
      return toProfile(row);
    }),

  create: perm(P.billing.manage)
    .input(profileInputSchema)
    .output(billingProfileSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.gstin.slice(0, 2) !== input.stateCode) {
        throw apiError("BAD_REQUEST", "GSTIN prefix must match state code");
      }
      if (input.canIssueGrnInvoice && input.profileType !== "company") {
        throw apiError("BAD_REQUEST", "Only company profiles can issue GRN invoices");
      }
      const row = await ctx.prisma.billingProfile.create({ data: input });
      return toProfile(row);
    }),

  update: perm(P.billing.manage)
    .input(profileInputSchema.partial().extend({ id: z.string().uuid() }))
    .output(billingProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.billingProfile.findUnique({ where: { id: input.id } });
      if (!existing) throw apiError("NOT_FOUND", "Billing profile not found");
      const profileType = input.profileType ?? existing.profileType;
      const canIssue = input.canIssueGrnInvoice ?? existing.canIssueGrnInvoice;
      const gstin = input.gstin ?? existing.gstin;
      const stateCode = input.stateCode ?? existing.stateCode;
      if (gstin.slice(0, 2) !== stateCode) {
        throw apiError("BAD_REQUEST", "GSTIN prefix must match state code");
      }
      if (canIssue && profileType !== "company") {
        throw apiError("BAD_REQUEST", "Only company profiles can issue GRN invoices");
      }
      const { id, ...data } = input;
      const row = await ctx.prisma.billingProfile.update({ where: { id }, data });
      return toProfile(row);
    }),

  // Compatibility facade for existing sales invoice PDF readers.
  get: perm(P.billing.read)
    .output(billingProfileSchema)
    .query(async ({ ctx }) => {
      const row = await ctx.prisma.billingProfile.findFirst({
        where: { profileType: "company", isActive: true },
        orderBy: [{ canIssueGrnInvoice: "desc" }, { createdAt: "asc" }],
      });
      if (!row) throw apiError("NOT_FOUND", "No active company billing profile configured");
      return toProfile(row);
    }),

  upsert: perm(P.billing.manage)
    .input(z.object({
      companyName: z.string().trim().min(1),
      addressLine1: z.string().trim().min(1),
      addressLine2: z.string().trim().default(""),
      city: z.string().trim().min(1),
      state: z.string().trim().min(1),
      stateCode: stateCodeSchema.default("00"),
      pincode: z.string().trim().regex(/^[0-9]{6}$/),
      country: z.string().trim().default("India"),
      gstin: gstinSchema,
      pan: panSchema,
      sacCode: z.string().optional(),
      logoUrl: z.string().url().nullable().optional(),
    }))
    .output(billingProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.billingProfile.findFirst({ where: { profileType: "company" } });
      const data = {
        legalName: input.companyName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 || null,
        city: input.city,
        state: input.state,
        stateCode: input.gstin.slice(0, 2),
        pincode: input.pincode,
        country: input.country,
        gstin: input.gstin,
        pan: input.pan,
        logoUrl: input.logoUrl,
        profileType: "company" as const,
        canIssueGrnInvoice: true,
        isActive: true,
      };
      const row = existing
        ? await ctx.prisma.billingProfile.update({ where: { id: existing.id }, data })
        : await ctx.prisma.billingProfile.create({ data });
      return toProfile(row);
    }),
});
