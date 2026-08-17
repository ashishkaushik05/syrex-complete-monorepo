import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { actorHasInternalSalesOutletAccess, findActorLinkedOutletId, resolveFinancialScope } from "./outlet-access";

const outletSchema = z.object({
  id: z.string(),
  outletCode: z.string(),
  userId: z.string(),
  warehouseId: z.string().nullable(),
  billingProfileId: z.string().nullable(),
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
  billingProfile: z.object({
    id: z.string(),
    legalName: z.string(),
    gstin: z.string(),
    addressLine1: z.string(),
    addressLine2: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    stateCode: z.string(),
    pincode: z.string(),
    country: z.string(),
    isActive: z.boolean(),
  }).nullable(),
});

const billingFieldsSchema = z.object({
  billingProfileId: z.string().uuid().optional().nullable(),
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
  billingProfileId: string | null;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  creditLimit: { toString(): string };
  outstandingBalance: { toString(): string };
  isActive: boolean;
  createdAt: Date;
  billingProfile?: {
    id: string;
    legalName: string;
    gstin: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    stateCode: string;
    pincode: string;
    country: string;
    isActive: boolean;
  } | null;
}) {
  return {
    id: outlet.id,
    outletCode: outlet.outletCode,
    userId: outlet.userId,
    warehouseId: outlet.warehouseId,
    billingProfileId: outlet.billingProfileId,
    name: outlet.name,
    ownerName: outlet.ownerName,
    phone: outlet.phone,
    address: outlet.address,
    creditLimit: outlet.creditLimit.toString(),
    outstandingBalance: outlet.outstandingBalance.toString(),
    isActive: outlet.isActive,
    createdAt: outlet.createdAt.toISOString(),
    legalName: outlet.billingProfile?.legalName ?? null,
    gstin: outlet.billingProfile?.gstin ?? null,
    billingAddress1: outlet.billingProfile?.addressLine1 ?? null,
    billingAddress2: outlet.billingProfile?.addressLine2 ?? null,
    billingCity: outlet.billingProfile?.city ?? null,
    billingState: outlet.billingProfile?.state ?? null,
    billingPincode: outlet.billingProfile?.pincode ?? null,
    billingCountry: outlet.billingProfile?.country ?? "India",
    billingProfile: outlet.billingProfile ?? null,
  };
}

const billingProfileInclude = {
  billingProfile: {
    select: {
      id: true,
      legalName: true,
      gstin: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      stateCode: true,
      pincode: true,
      country: true,
      isActive: true,
    },
  },
} as const;

async function assertOutletBillingProfile(
  prisma: typeof import("../../infra/db/prisma").prisma,
  billingProfileId: string | null | undefined,
) {
  if (!billingProfileId) return;
  const profile = await prisma.billingProfile.findUnique({ where: { id: billingProfileId } });
  if (!profile || profile.profileType !== "outlet" || !profile.isActive) {
    throw apiError("BAD_REQUEST", "Outlet billing profile must be active and have type outlet");
  }
}

export const outletsRouter = createTRPCRouter({
  list: perm(P.outlets.read)
    .input(listOutletsInputSchema)
    .output(z.object({ items: z.array(outletSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const cursor = decodeCursor(input.cursor);
      const { linkedOutletId, hasGlobalAccess: hasGlobalOutletAccess, isWarehouseScoped } =
        resolveFinancialScope(ctx, { includeInternalSales: true, errorMessage: "No safe outlet scope available" });

      const outlets = await ctx.prisma.outlet.findMany({
        where: {
          isActive: input.isActive,
          ...(linkedOutletId && !hasGlobalOutletAccess ? { id: linkedOutletId } : {}),
          ...(isWarehouseScoped ? { warehouseId: ctx.managedWarehouseId } : input.warehouseId ? { warehouseId: input.warehouseId } : {}),
          AND: [
            ...(input.q ? [{ OR: [{ outletCode: { contains: input.q, mode: "insensitive" as const } }, { name: { contains: input.q, mode: "insensitive" as const } }, { ownerName: { contains: input.q, mode: "insensitive" as const } }] }] : []),
            ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
          ],
        },
        include: billingProfileInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
      };
    }),

  getById: perm(P.outlets.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(outletSchema)
    .query(async ({ ctx, input }) => {
      const linkedOutletId = findActorLinkedOutletId(ctx);
      const isSuperAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
      const hasInternalSalesAccess = actorHasInternalSalesOutletAccess(ctx);
      const hasGlobalOutletAccess = isSuperAdmin || hasInternalSalesAccess;

      if (linkedOutletId && !hasGlobalOutletAccess && linkedOutletId !== input.id) {
        throw apiError("NOT_FOUND", "Outlet not found");
      }

      const isWarehouseScoped = !hasGlobalOutletAccess && !linkedOutletId && !!ctx.managedWarehouseId;
      if (!hasGlobalOutletAccess && !linkedOutletId && !isWarehouseScoped) {
        throw apiError("FORBIDDEN", "No safe outlet scope available");
      }

      const outlet = await ctx.prisma.outlet.findFirst({
        where: {
          id: input.id,
          ...(isWarehouseScoped ? { warehouseId: ctx.managedWarehouseId } : {}),
          // TODO(batch-08): replace warehouse fallback with outlet.orgId/warehouse.orgId.
        },
        include: billingProfileInclude,
      });
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
    await assertOutletBillingProfile(ctx.prisma, input.billingProfileId);

    const outlet = await ctx.prisma.outlet.create({
      data: {
        outletCode: input.outletCode,
        userId: input.userId,
        warehouseId: input.warehouseId,
        billingProfileId: input.billingProfileId,
        name: input.name,
        ownerName: input.ownerName,
        phone: input.phone,
        address: input.address,
        creditLimit: input.creditLimit,
        isActive: input.isActive,
      },
      include: billingProfileInclude,
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
    await assertOutletBillingProfile(ctx.prisma, input.billingProfileId);

    const outlet = await ctx.prisma.outlet.update({
      where: { id: input.id },
      data: {
        userId: input.userId,
        warehouseId: input.warehouseId,
        billingProfileId: input.billingProfileId,
        name: input.name,
        ownerName: input.ownerName,
        phone: input.phone,
        address: input.address,
        creditLimit: input.creditLimit,
        isActive: input.isActive,
      },
      include: billingProfileInclude,
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
      await assertOutletBillingProfile(ctx.prisma, input.billingProfileId);
      const outlet = await ctx.prisma.outlet.update({
        where: { id: input.id },
        data: {
          billingProfileId: input.billingProfileId,
        },
        include: billingProfileInclude,
      });
      return toOutlet(outlet);
    }),
});
