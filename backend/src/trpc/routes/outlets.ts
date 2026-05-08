import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
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
  createdAt: z.string()
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
  isActive: z.boolean().default(true)
});

const updateOutletSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  ownerName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  creditLimit: z.string().min(1).optional(),
  isActive: z.boolean().optional()
});

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
    createdAt: outlet.createdAt.toISOString()
  };
}

export const outletsRouter = createTRPCRouter({
  list: protectedProcedure
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
      const hasMore = outlets.length > input.limit;
      const pageItems = hasMore ? outlets.slice(0, input.limit) : outlets;
      return {
        items: pageItems.map(toOutlet),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(outletSchema)
    .query(async ({ ctx, input }) => {
      const outlet = await ctx.prisma.outlet.findUnique({ where: { id: input.id } });
      if (!outlet) {
        throw apiError("NOT_FOUND", "Outlet not found");
      }
      return toOutlet(outlet);
    }),

  create: protectedProcedure.input(createOutletSchema).output(outletSchema).mutation(async ({ ctx, input }) => {
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
        isActive: input.isActive
      }
    });
    return toOutlet(outlet);
  }),

  update: protectedProcedure.input(updateOutletSchema).output(outletSchema).mutation(async ({ ctx, input }) => {
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
        warehouseId: input.warehouseId,
        name: input.name,
        ownerName: input.ownerName,
        phone: input.phone,
        address: input.address,
        creditLimit: input.creditLimit,
        isActive: input.isActive
      }
    });
    return toOutlet(outlet);
  })
});
