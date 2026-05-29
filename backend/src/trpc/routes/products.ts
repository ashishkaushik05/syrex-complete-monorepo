import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const productSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  brandId: z.string().nullable(),
  name: z.string(),
  displayName: z.string().nullable(),
  sku: z.string(),
  description: z.string().nullable(),
  specs: z.unknown().nullable(),
  warrantyMonths: z.number().int(),
  basePrice: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  displayName: z.string().nullable().optional(),
  sku: z.string().min(1),
  description: z.string().nullable().optional(),
  specs: z.record(z.string(), z.unknown()).nullable().optional(),
  warrantyMonths: z.number().int().min(0),
  basePrice: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

const updateProductSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  displayName: z.string().nullable().optional(),
  sku: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  specs: z.record(z.string(), z.unknown()).nullable().optional(),
  warrantyMonths: z.number().int().min(0).optional(),
  basePrice: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});

const listProductsInputSchema = paginationInputSchema.extend({
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  q: z.string().min(1).optional()
});

function toInputJson(
  value: z.infer<typeof createProductSchema>["specs"] | z.infer<typeof updateProductSchema>["specs"]
) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

function toProduct(product: {
  id: string;
  categoryId: string;
  category?: { brandId: string } | null;
  name: string;
  displayName: string | null;
  sku: string;
  description: string | null;
  specs: unknown;
  warrantyMonths: number;
  basePrice: { toString(): string };
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    brandId: product.category?.brandId ?? null,
    name: product.name,
    displayName: product.displayName,
    sku: product.sku,
    description: product.description,
    specs: product.specs ?? null,
    warrantyMonths: product.warrantyMonths,
    basePrice: product.basePrice.toString(),
    sortOrder: product.sortOrder,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}

export const productsRouter = createTRPCRouter({
  list: perm(P.catalog.read)
    .input(listProductsInputSchema)
    .output(z.object({ items: z.array(productSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const products = await ctx.prisma.product.findMany({
        where: {
          categoryId: input.categoryId,
          category: input.brandId ? { brandId: input.brandId } : undefined,
          isActive: input.isActive,
          OR: input.q
            ? [
                { name: { contains: input.q, mode: "insensitive" } },
                { sku: { contains: input.q, mode: "insensitive" } },
                { displayName: { contains: input.q, mode: "insensitive" } }
              ]
            : undefined
        },
        include: { category: { select: { brandId: true } } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });
      const hasMore = products.length > input.limit;
      const pageItems = hasMore ? products.slice(0, input.limit) : products;
      return {
        items: pageItems.map(toProduct),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm(P.catalog.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(productSchema)
    .query(async ({ ctx, input }) => {
      const product = await ctx.prisma.product.findUnique({
        where: { id: input.id },
        include: { category: { select: { brandId: true } } }
      });
      if (!product) {
        throw apiError("NOT_FOUND", "Product not found");
      }
      return toProduct(product);
    }),

  create: perm(P.catalog.write).input(createProductSchema).output(productSchema).mutation(async ({ ctx, input }) => {
    const category = await ctx.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      throw apiError("BAD_REQUEST", "Invalid categoryId");
    }
    const existing = await ctx.prisma.product.findUnique({ where: { sku: input.sku } });
    if (existing) {
      throw apiError("CONFLICT", "SKU already exists");
    }
    const product = await ctx.prisma.product.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        displayName: input.displayName,
        sku: input.sku,
        description: input.description,
        specs: toInputJson(input.specs),
        warrantyMonths: input.warrantyMonths,
        basePrice: input.basePrice,
        sortOrder: input.sortOrder,
        isActive: input.isActive
      }
    });
    return toProduct(product);
  }),

  update: perm(P.catalog.write).input(updateProductSchema).output(productSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.product.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "Product not found");
    }
    if (input.categoryId) {
      const category = await ctx.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) {
        throw apiError("BAD_REQUEST", "Invalid categoryId");
      }
    }
    if (input.sku && input.sku !== existing.sku) {
      const skuExists = await ctx.prisma.product.findUnique({ where: { sku: input.sku } });
      if (skuExists) {
        throw apiError("CONFLICT", "SKU already exists");
      }
    }
    const product = await ctx.prisma.product.update({
      where: { id: input.id },
      data: {
        categoryId: input.categoryId,
        name: input.name,
        displayName: input.displayName,
        sku: input.sku,
        description: input.description,
        specs: toInputJson(input.specs),
        warrantyMonths: input.warrantyMonths,
        basePrice: input.basePrice,
        sortOrder: input.sortOrder,
        isActive: input.isActive
      }
    });
    return toProduct(product);
  })
});
