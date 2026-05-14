import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const createBrandSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true)
});

const updateBrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional()
});

const listBrandsInputSchema = paginationInputSchema.extend({
  isActive: z.boolean().optional(),
  q: z.string().min(1).optional()
});

function toBrand(brand: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...brand,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString()
  };
}

export const brandsRouter = createTRPCRouter({
  list: perm(P.catalog.read)
    .input(listBrandsInputSchema)
    .output(z.object({ items: z.array(brandSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const brands = await ctx.prisma.brand.findMany({
        where: {
          isActive: input.isActive,
          OR: input.q ? [{ name: { contains: input.q, mode: "insensitive" } }] : undefined
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });
      const hasMore = brands.length > input.limit;
      const pageItems = hasMore ? brands.slice(0, input.limit) : brands;
      return {
        items: pageItems.map(toBrand),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm(P.catalog.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(brandSchema)
    .query(async ({ ctx, input }) => {
      const brand = await ctx.prisma.brand.findUnique({ where: { id: input.id } });
      if (!brand) {
        throw apiError("NOT_FOUND", "Brand not found");
      }
      return toBrand(brand);
    }),

  create: perm(P.catalog.write).input(createBrandSchema).output(brandSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.brand.findUnique({ where: { name: input.name } });
    if (existing) {
      throw apiError("CONFLICT", "Brand name already exists");
    }
    const brand = await ctx.prisma.brand.create({
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive
      }
    });
    return toBrand(brand);
  }),

  update: perm(P.catalog.write).input(updateBrandSchema).output(brandSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.brand.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "Brand not found");
    }
    const brand = await ctx.prisma.brand.update({
      where: { id: input.id },
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive
      }
    });
    return toBrand(brand);
  })
});
