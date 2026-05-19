import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";

const chargeTypeSchema = z.enum(["percentage", "fixed"]);

const taxChargeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: chargeTypeSchema,
  rate: z.string(),
  isActive: z.boolean(),
  displayOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

function toTaxChargeItem(row: {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  rate: Prisma.Decimal;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    rate: row.rate.toFixed(2),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const taxChargesRouter = createTRPCRouter({
  list: perm(P.billing.read)
    .output(z.object({ items: z.array(taxChargeSchema) }))
    .query(async ({ ctx }) => {
      const rows = await ctx.prisma.taxCharge.findMany({
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      });
      return { items: rows.map(toTaxChargeItem) };
    }),

  create: perm(P.billing.manage)
    .input(
      z.object({
        name: z.string().min(1),
        type: chargeTypeSchema,
        rate: z.string().min(1),
        isActive: z.boolean().default(true),
        displayOrder: z.number().int().default(0),
      })
    )
    .output(taxChargeSchema)
    .mutation(async ({ ctx, input }) => {
      const rate = new Prisma.Decimal(input.rate);
      if (rate.lte(0)) throw apiError("BAD_REQUEST", "Rate must be positive");
      if (input.type === "percentage" && rate.gt(100)) {
        throw apiError("BAD_REQUEST", "Percentage rate cannot exceed 100");
      }
      const row = await ctx.prisma.taxCharge.create({
        data: {
          name: input.name,
          type: input.type,
          rate,
          isActive: input.isActive,
          displayOrder: input.displayOrder,
        },
      });
      return toTaxChargeItem(row);
    }),

  update: perm(P.billing.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        type: chargeTypeSchema.optional(),
        rate: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        displayOrder: z.number().int().optional(),
      })
    )
    .output(taxChargeSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.taxCharge.findUnique({ where: { id: input.id } });
      if (!existing) throw apiError("NOT_FOUND", "Tax charge not found");

      let rate: Prisma.Decimal | undefined;
      if (input.rate !== undefined) {
        rate = new Prisma.Decimal(input.rate);
        if (rate.lte(0)) throw apiError("BAD_REQUEST", "Rate must be positive");
        const resolvedType = input.type ?? existing.type;
        if (resolvedType === "percentage" && rate.gt(100)) {
          throw apiError("BAD_REQUEST", "Percentage rate cannot exceed 100");
        }
      }

      const row = await ctx.prisma.taxCharge.update({
        where: { id: input.id },
        data: {
          name: input.name,
          type: input.type,
          rate,
          isActive: input.isActive,
          displayOrder: input.displayOrder,
        },
      });
      return toTaxChargeItem(row);
    }),

  reorder: perm(P.billing.manage)
    .input(z.object({ orderedIds: z.array(z.string().uuid()).min(1) }))
    .output(z.object({ items: z.array(taxChargeSchema) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.taxCharge.update({ where: { id }, data: { displayOrder: index } })
        )
      );
      const rows = await ctx.prisma.taxCharge.findMany({
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      });
      return { items: rows.map(toTaxChargeItem) };
    }),

  delete: perm(P.billing.manage)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.taxCharge.findUnique({ where: { id: input.id } });
      if (!existing) throw apiError("NOT_FOUND", "Tax charge not found");

      const usageCount = await ctx.prisma.invoiceCharge.count({ where: { taxChargeId: input.id } });
      if (usageCount > 0) {
        // Referenced by invoices — soft-delete only
        await ctx.prisma.taxCharge.update({ where: { id: input.id }, data: { isActive: false } });
      } else {
        await ctx.prisma.taxCharge.delete({ where: { id: input.id } });
      }
      return { deleted: true };
    }),
});
