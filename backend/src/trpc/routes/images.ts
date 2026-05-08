import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const imageSchema = z.object({
  id: z.string(),
  uri: z.string(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
  brandId: z.string().nullable(),
  categoryId: z.string().nullable(),
  productId: z.string().nullable(),
  createdAt: z.string()
});

const createImageSchema = z.object({
  uri: z.string().url(),
  altText: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional()
});

const updateImageSchema = z.object({
  id: z.string().uuid(),
  uri: z.string().url().optional(),
  altText: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  brandId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional()
});

const listImagesInputSchema = paginationInputSchema.extend({
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional()
});

function validateOneTarget(input: { brandId?: string | null; categoryId?: string | null; productId?: string | null }) {
  const links = [input.brandId, input.categoryId, input.productId].filter(Boolean);
  if (links.length !== 1) {
    throw apiError("BAD_REQUEST", "Exactly one of brandId/categoryId/productId is required");
  }
}

function toImage(image: {
  id: string;
  uri: string;
  altText: string | null;
  sortOrder: number;
  brandId: string | null;
  categoryId: string | null;
  productId: string | null;
  createdAt: Date;
}) {
  return {
    ...image,
    createdAt: image.createdAt.toISOString()
  };
}

export const imagesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(listImagesInputSchema)
    .output(z.object({ items: z.array(imageSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const images = await ctx.prisma.image.findMany({
        where: {
          brandId: input.brandId,
          categoryId: input.categoryId,
          productId: input.productId
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });
      const hasMore = images.length > input.limit;
      const pageItems = hasMore ? images.slice(0, input.limit) : images;
      return {
        items: pageItems.map(toImage),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(imageSchema)
    .query(async ({ ctx, input }) => {
      const image = await ctx.prisma.image.findUnique({ where: { id: input.id } });
      if (!image) {
        throw apiError("NOT_FOUND", "Image not found");
      }
      return toImage(image);
    }),

  create: protectedProcedure.input(createImageSchema).output(imageSchema).mutation(async ({ ctx, input }) => {
    validateOneTarget(input);
    const image = await ctx.prisma.image.create({
      data: {
        uri: input.uri,
        altText: input.altText,
        sortOrder: input.sortOrder,
        brandId: input.brandId,
        categoryId: input.categoryId,
        productId: input.productId
      }
    });
    return toImage(image);
  }),

  update: protectedProcedure.input(updateImageSchema).output(imageSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.image.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "Image not found");
    }

    const nextRef = {
      brandId: input.brandId !== undefined ? input.brandId : existing.brandId,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      productId: input.productId !== undefined ? input.productId : existing.productId
    };
    validateOneTarget(nextRef);

    const image = await ctx.prisma.image.update({
      where: { id: input.id },
      data: {
        uri: input.uri,
        altText: input.altText,
        sortOrder: input.sortOrder,
        brandId: input.brandId,
        categoryId: input.categoryId,
        productId: input.productId
      }
    });
    return toImage(image);
  })
});
