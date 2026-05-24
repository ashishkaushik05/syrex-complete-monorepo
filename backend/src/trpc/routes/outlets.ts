import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const outletSchema = z.object({
  id: z.string(),
  outletCode: z.string(),
  userId: z.string(),
  warehouseId: z.string().nullable(),
  name: z.string(),
  ownerName: z.string(),
  phone: z.string(),
  address: z.string(),
  creditLimit: z.string(),
  outstandingBalance: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  // Billing / GST details
  legalName: z.string().nullable(),
  gstin: z.string().nullable(),
  billingAddress1: z.string().nullable(),
  billingAddress2: z.string().nullable(),
  billingCity: z.string().nullable(),
  billingState: z.string().nullable(),
  billingPincode: z.string().nullable(),
  billingCountry: z.string(),
});

const billingFieldsSchema = z.object({
  legalName: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  billingAddress1: z.string().optional().nullable(),
  billingAddress2: z.string().optional().nullable(),
  billingCity: z.string().optional().nullable(),
  billingState: z.string().optional().nullable(),
  billingPincode: z.string().optional().nullable(),
  billingCountry: z.string().optional(),
});

const createOutletSchema = z.object({
  outletCode: z.string().min(1),
  userId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  ownerName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  creditLimit: z.string().min(1),
  isActive: z.boolean().default(true),
}).merge(billingFieldsSchema);

const updateOutletSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  ownerName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  creditLimit: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
}).merge(billingFieldsSchema);

const updateBillingSchema = z.object({
  id: z.string().uuid(),
}).merge(billingFieldsSchema);

const listOutletsInputSchema = paginationInputSchema.extend({
  warehouseId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  q: z.string().min(1).optional()
});

function toOutlet(outlet: {
  id: string;
  outletCode: string;
  userId: string;
  warehouseId: string | null;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  creditLimit: { toString(): string };
  outstandingBalance: { toString(): string };
  isActive: boolean;
  createdAt: Date;
  legalName?: string | null;
  gstin?: string | null;
  billingAddress1?: string | null;
  billingAddress2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPincode?: string | null;
  billingCountry?: string;
}) {
  return {
    id: outlet.id,
    outletCode: outlet.outletCode,
    userId: outlet.userId,
    warehouseId: outlet.warehouseId,
    name: outlet.name,
    ownerName: outlet.ownerName,
    phone: outlet.phone,
    address: outlet.address,
    creditLimit: outlet.creditLimit.toString(),
    outstandingBalance: outlet.outstandingBalance.toString(),
    isActive: outlet.isActive,
    createdAt: outlet.createdAt.toISOString(),
    legalName: outlet.legalName ?? null,
    gstin: outlet.gstin ?? null,
    billingAddress1: outlet.billingAddress1 ?? null,
    billingAddress2: outlet.billingAddress2 ?? null,
    billingCity: outlet.billingCity ?? null,
    billingState: outlet.billingState ?? null,
    billingPincode: outlet.billingPincode ?? null,
    billingCountry: outlet.billingCountry ?? "India",
  };
}

export const outletsRouter = createTRPCRouter({
  list: perm(P.outlets.read)
    .input(listOutletsInputSchema)
    .output(z.object({ items: z.array(outletSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const outlets = await ctx.prisma.outlet.findMany({
        where: {
          warehouseId: input.warehouseId,
          isActive: input.isActive,
          OR: input.q
            ? [
                { outletCode: { contains: input.q, mode: "insensitive" } },
                { name: { contains: input.q, mode: "insensitive" } },
                { ownerName: { contains: input.q, mode: "insensitive" } }
              ]
            : undefined
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });
      const outletIds = outlets.map((o) => o.id);
      const liveOutstandingRows = outletIds.length
        ? await ctx.prisma.invoice.groupBy({
            by: ["outletId"],
            where: { outletId: { in: outletIds } },
            _sum: { amountDue: true },
          })
        : [];
      const outstandingByOutletId = new Map(
        liveOutstandingRows.map((row) => [row.outletId, row._sum.amountDue ?? new Prisma.Decimal(0)]),
      );
      const hasMore = outlets.length > input.limit;
      const pageItems = hasMore ? outlets.slice(0, input.limit) : outlets;
      return {
        items: pageItems.map((outlet) =>
          toOutlet({
            ...outlet,
            outstandingBalance: outstandingByOutletId.get(outlet.id) ?? new Prisma.Decimal(0),
          }),
        ),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm(P.outlets.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(outletSchema)
    .query(async ({ ctx, input }) => {
      const outlet = await ctx.prisma.outlet.findUnique({ where: { id: input.id } });
      if (!outlet) {
        throw apiError("NOT_FOUND", "Outlet not found");
      }
      const liveOutstanding = await ctx.prisma.invoice.aggregate({
        where: { outletId: input.id },
        _sum: { amountDue: true },
      });
      return toOutlet({
        ...outlet,
        outstandingBalance: liveOutstanding._sum.amountDue ?? new Prisma.Decimal(0),
      });
    }),

  create: perm(P.outlets.write).input(createOutletSchema).output(outletSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw apiError("BAD_REQUEST", "Invalid userId");
    }
    if (input.warehouseId) {
      const warehouse = await ctx.prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
      if (!warehouse) {
        throw apiError("BAD_REQUEST", "Invalid warehouseId");
      }
    }

    const outlet = await ctx.prisma.outlet.create({
      data: {
        outletCode: input.outletCode,
        userId: input.userId,
        warehouseId: input.warehouseId,
        name: input.name,
        ownerName: input.ownerName,
        phone: input.phone,
        address: input.address,
        creditLimit: input.creditLimit,
        isActive: input.isActive,
        legalName: input.legalName,
        gstin: input.gstin,
        billingAddress1: input.billingAddress1,
        billingAddress2: input.billingAddress2,
        billingCity: input.billingCity,
        billingState: input.billingState,
        billingPincode: input.billingPincode,
        billingCountry: input.billingCountry,
      }
    });
    return toOutlet(outlet);
  }),

  update: perm(P.outlets.write).input(updateOutletSchema).output(outletSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.outlet.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "Outlet not found");
    }
    if (input.warehouseId) {
      const warehouse = await ctx.prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
      if (!warehouse) {
        throw apiError("BAD_REQUEST", "Invalid warehouseId");
      }
    }

    const outlet = await ctx.prisma.outlet.update({
      where: { id: input.id },
      data: {
        userId: input.userId,
        warehouseId: input.warehouseId,
        name: input.name,
        ownerName: input.ownerName,
        phone: input.phone,
        address: input.address,
        creditLimit: input.creditLimit,
        isActive: input.isActive,
        legalName: input.legalName,
        gstin: input.gstin,
        billingAddress1: input.billingAddress1,
        billingAddress2: input.billingAddress2,
        billingCity: input.billingCity,
        billingState: input.billingState,
        billingPincode: input.billingPincode,
        billingCountry: input.billingCountry,
      }
    });
    return toOutlet(outlet);
  }),

  updateBilling: perm(P.outlets.write)
    .input(updateBillingSchema)
    .output(outletSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.outlet.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Outlet not found");
      }
      const outlet = await ctx.prisma.outlet.update({
        where: { id: input.id },
        data: {
          legalName: input.legalName,
          gstin: input.gstin,
          billingAddress1: input.billingAddress1,
          billingAddress2: input.billingAddress2,
          billingCity: input.billingCity,
          billingState: input.billingState,
          billingPincode: input.billingPincode,
          billingCountry: input.billingCountry,
        }
      });
      return toOutlet(outlet);
    }),
});
