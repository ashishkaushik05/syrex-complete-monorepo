import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const categorySchema = z.object({
  id: z.string(),
  brandId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const createCategorySchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

const updateCategorySchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});

const listCategoriesInputSchema = paginationInputSchema.extend({
  brandId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  q: z.string().min(1).optional()
});

function toCategory(category: {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString()
  };
}

export const categoriesRouter = createTRPCRouter({
  list: perm(P.catalog.read)
    .input(listCategoriesInputSchema)
    .output(z.object({ items: z.array(categorySchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const cursor = decodeCursor(input.cursor);
      const categories = await ctx.prisma.category.findMany({
        where: {
          brandId: input.brandId,
          isActive: input.isActive,
          AND: [
            ...(input.q ? [{ OR: [{ name: { contains: input.q, mode: "insensitive" as const } }] }] : []),
            ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1
      });
      const hasMore = categories.length > input.limit;
      const pageItems = hasMore ? categories.slice(0, input.limit) : categories;
      return {
        items: pageItems.map(toCategory),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
      };
    }),

  getById: perm(P.catalog.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(categorySchema)
    .query(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findUnique({ where: { id: input.id } });
      if (!category) {
        throw apiError("NOT_FOUND", "Category not found");
      }
      return toCategory(category);
    }),

  create: perm(P.catalog.write)
    .input(createCategorySchema)
    .output(categorySchema)
    .mutation(async ({ ctx, input }) => {
      const brand = await ctx.prisma.brand.findUnique({ where: { id: input.brandId } });
      if (!brand) {
        throw apiError("BAD_REQUEST", "Invalid brandId");
      }
      const category = await ctx.prisma.category.create({
        data: {
          brandId: input.brandId,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
          isActive: input.isActive
        }
      });
      return toCategory(category);
    }),

  update: perm(P.catalog.write)
    .input(updateCategorySchema)
    .output(categorySchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.category.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Category not found");
      }
      if (input.brandId) {
        const brand = await ctx.prisma.brand.findUnique({ where: { id: input.brandId } });
        if (!brand) {
          throw apiError("BAD_REQUEST", "Invalid brandId");
        }
      }
      const category = await ctx.prisma.category.update({
        where: { id: input.id },
        data: {
          brandId: input.brandId,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
          isActive: input.isActive
        }
      });
      return toCategory(category);
    })
});
