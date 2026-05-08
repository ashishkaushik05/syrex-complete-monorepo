import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const warehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  address: z.string().nullable(),
  managerId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string()
});

const createWarehouseSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  address: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true)
});

const updateWarehouseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
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
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    ...warehouse,
    createdAt: warehouse.createdAt.toISOString()
  };
}

export const warehousesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(listWarehousesInputSchema)
    .output(z.object({ items: z.array(warehouseSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const warehouses = await ctx.prisma.warehouse.findMany({
        where: {
          isActive: input.isActive,
          managerId: input.managerId,
          OR: input.q
            ? [
                { name: { contains: input.q, mode: "insensitive" } },
                { location: { contains: input.q, mode: "insensitive" } }
              ]
            : undefined
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });
      const hasMore = warehouses.length > input.limit;
      const pageItems = hasMore ? warehouses.slice(0, input.limit) : warehouses;
      return {
        items: pageItems.map(toWarehouse),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(warehouseSchema)
    .query(async ({ ctx, input }) => {
      const warehouse = await ctx.prisma.warehouse.findUnique({ where: { id: input.id } });
      if (!warehouse) {
        throw apiError("NOT_FOUND", "Warehouse not found");
      }
      return toWarehouse(warehouse);
    }),

  create: protectedProcedure
    .input(createWarehouseSchema)
    .output(warehouseSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.managerId) {
        const user = await ctx.prisma.user.findUnique({ where: { id: input.managerId } });
        if (!user) {
          throw apiError("BAD_REQUEST", "Invalid managerId");
        }
      }
      const warehouse = await ctx.prisma.warehouse.create({
        data: {
          name: input.name,
          location: input.location,
          address: input.address,
          managerId: input.managerId,
          isActive: input.isActive
        }
      });
      return toWarehouse(warehouse);
    }),

  update: protectedProcedure
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
      const warehouse = await ctx.prisma.warehouse.update({
        where: { id: input.id },
        data: {
          name: input.name,
          location: input.location,
          address: input.address,
          managerId: input.managerId,
          isActive: input.isActive
        }
      });
      return toWarehouse(warehouse);
    })
});
