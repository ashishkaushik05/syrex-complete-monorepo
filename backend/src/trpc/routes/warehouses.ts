import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

function isAdmin(ctx: { permissions: string[] }) {
  return ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
}

function hasGlobalWarehouseAccess(ctx: { permissions: string[]; managedWarehouseId: string | null }) {
  return isAdmin(ctx) || (!ctx.managedWarehouseId && ctx.permissions.includes(P.inventory["grn-reverse"]));
}

const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  address: z.string().nullable(),
  managerId: z.string().nullable(),
  billingProfileId: z.string().nullable(),
  manager: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  billingProfile: z.object({
    id: z.string(),
    legalName: z.string(),
    gstin: z.string(),
    state: z.string(),
    stateCode: z.string(),
    isActive: z.boolean(),
  }).nullable(),
  isActive: z.boolean(),
  createdAt: z.string()
});

const createWarehouseSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  address: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  billingProfileId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(false)
});

const updateWarehouseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  billingProfileId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional()
});

const listWarehousesInputSchema = paginationInputSchema.extend({
  isActive: z.boolean().optional(),
  managerId: z.string().uuid().optional(),
  q: z.string().min(1).optional()
});

function toWarehouse(warehouse: {
  id: string;
  name: string;
  location: string;
  address: string | null;
  managerId: string | null;
  billingProfileId: string | null;
  manager: { id: string; name: string; email: string } | null;
  billingProfile: { id: string; legalName: string; gstin: string; state: string; stateCode: string; isActive: boolean } | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    ...warehouse,
    createdAt: warehouse.createdAt.toISOString()
  };
}

const managerInclude = {
  manager: { select: { id: true, name: true, email: true } },
  billingProfile: {
    select: { id: true, legalName: true, gstin: true, state: true, stateCode: true, isActive: true },
  },
} as const;

async function assertActivationConfiguration(
  prisma: {
    billingProfile: {
      findUnique(args: { where: { id: string } }): Promise<{ profileType: string; isActive: boolean } | null>;
    };
  },
  managerId: string | null | undefined,
  billingProfileId: string | null | undefined,
) {
  if (!managerId) throw apiError("BAD_REQUEST", "Active warehouse requires an assigned manager");
  if (!billingProfileId) throw apiError("BAD_REQUEST", "Active warehouse requires a billing profile");
  const profile = await prisma.billingProfile.findUnique({ where: { id: billingProfileId } });
  if (!profile || !profile.isActive || profile.profileType !== "warehouse") {
    throw apiError("BAD_REQUEST", "Warehouse billing profile must be active and have type warehouse");
  }
}

export const warehousesRouter = createTRPCRouter({
  list: perm(P.warehouses.read)
    .input(listWarehousesInputSchema)
    .output(z.object({ items: z.array(warehouseSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const cursor = decodeCursor(input.cursor);
      const managerFilter = hasGlobalWarehouseAccess(ctx) ? input.managerId : ctx.actor.id;
      const warehouses = await ctx.prisma.warehouse.findMany({
        where: {
          isActive: input.isActive,
          managerId: managerFilter,
          AND: [
            ...(input.q ? [{ OR: [{ name: { contains: input.q, mode: "insensitive" as const } }, { location: { contains: input.q, mode: "insensitive" as const } }] }] : []),
            ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
          ],
        },
        include: managerInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1
      });
      const hasMore = warehouses.length > input.limit;
      const pageItems = hasMore ? warehouses.slice(0, input.limit) : warehouses;
      return {
        items: pageItems.map(toWarehouse),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
      };
    }),

  getById: perm(P.warehouses.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(warehouseSchema)
    .query(async ({ ctx, input }) => {
      const warehouse = await ctx.prisma.warehouse.findUnique({
        where: { id: input.id },
        include: managerInclude
      });
      if (!warehouse) {
        throw apiError("NOT_FOUND", "Warehouse not found");
      }
      if (!hasGlobalWarehouseAccess(ctx) && warehouse.managerId !== ctx.actor.id) {
        throw apiError("NOT_FOUND", "Warehouse not found");
      }
      return toWarehouse(warehouse);
    }),

  create: perm(P.warehouses.write)
    .input(createWarehouseSchema)
    .output(warehouseSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.managerId) {
        const user = await ctx.prisma.user.findUnique({ where: { id: input.managerId } });
        if (!user) {
          throw apiError("BAD_REQUEST", "Invalid managerId");
        }
      }
      if (input.isActive) {
        await assertActivationConfiguration(ctx.prisma, input.managerId, input.billingProfileId);
      }
      const warehouse = await ctx.prisma.warehouse.create({
        data: {
          name: input.name,
          location: input.location,
          address: input.address,
          managerId: input.managerId,
          billingProfileId: input.billingProfileId,
          isActive: input.isActive
        },
        include: managerInclude
      });
      return toWarehouse(warehouse);
    }),

  update: perm(P.warehouses.write)
    .input(updateWarehouseSchema)
    .output(warehouseSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.warehouse.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Warehouse not found");
      }
      if (input.managerId) {
        const user = await ctx.prisma.user.findUnique({ where: { id: input.managerId } });
        if (!user) {
          throw apiError("BAD_REQUEST", "Invalid managerId");
        }
      }
      const nextManagerId = input.managerId === undefined ? existing.managerId : input.managerId;
      const nextBillingProfileId = input.billingProfileId === undefined
        ? existing.billingProfileId
        : input.billingProfileId;
      const nextIsActive = input.isActive ?? existing.isActive;
      if (nextIsActive) {
        await assertActivationConfiguration(ctx.prisma, nextManagerId, nextBillingProfileId);
      }
      const warehouse = await ctx.prisma.warehouse.update({
        where: { id: input.id },
        data: {
          name: input.name,
          location: input.location,
          address: input.address,
          managerId: input.managerId,
          billingProfileId: input.billingProfileId,
          isActive: input.isActive
        },
        include: managerInclude
      });
      return toWarehouse(warehouse);
    })
});
