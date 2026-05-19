import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";

const orgBillingProfileSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string(),
  gstin: z.string(),
  pan: z.string(),
  sacCode: z.string(),
  logoUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const upsertInputSchema = z.object({
  companyName: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().default(""),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string().default("India"),
  gstin: z.string(),
  pan: z.string(),
  sacCode: z.string(),
  logoUrl: z.string().url().nullable().optional(),
});

function toProfile(row: {
  id: string;
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  pan: string;
  sacCode: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    companyName: row.companyName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
    gstin: row.gstin,
    pan: row.pan,
    sacCode: row.sacCode,
    logoUrl: row.logoUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const orgBillingProfileRouter = createTRPCRouter({
  get: perm(P.billing.read)
    .output(orgBillingProfileSchema)
    .query(async ({ ctx }) => {
      let profile = await ctx.prisma.orgBillingProfile.findFirst();
      if (!profile) {
        profile = await ctx.prisma.orgBillingProfile.create({ data: {} });
      }
      return toProfile(profile);
    }),

  upsert: perm(P.billing.manage)
    .input(upsertInputSchema)
    .output(orgBillingProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.orgBillingProfile.findFirst();
      if (existing) {
        const updated = await ctx.prisma.orgBillingProfile.update({
          where: { id: existing.id },
          data: input,
        });
        return toProfile(updated);
      }
      const created = await ctx.prisma.orgBillingProfile.create({ data: input });
      return toProfile(created);
    }),
});
