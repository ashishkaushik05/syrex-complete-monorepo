import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const stockItemSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  productId: z.string(),
  currentQty: z.number().int(),
  reservedQty: z.number().int(),
  inTransitQty: z.number().int(),
  updatedAt: z.string(),
  product: z.object({
    id: z.string(),
    sku: z.string(),
    name: z.string()
  })
});

const goodsReceiptLineInputSchema = z.object({
  productId: z.string().uuid(),
  qtyReceived: z.number().int().positive()
});

const stockAdjustmentInputSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  adjustmentQty: z.number().int().refine((value) => value !== 0, "adjustmentQty must be non-zero"),
  reason: z.string().min(1)
});

function toStockItem(stock: {
  id: string;
  warehouseId: string;
  productId: string;
  currentQty: number;
  reservedQty: number;
  inTransitQty: number;
  updatedAt: Date;
  product: { id: string; sku: string; name: string };
}) {
  return {
    ...stock,
    updatedAt: stock.updatedAt.toISOString()
  };
}

export const inventoryRouter = createTRPCRouter({
  stockList: protectedProcedure
    .input(
      paginationInputSchema.extend({
        warehouseId: z.string().uuid(),
        productId: z.string().uuid().optional(),
        q: z.string().min(1).optional()
      })
    )
    .output(z.object({ items: z.array(stockItemSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const rows = await ctx.prisma.warehouseStock.findMany({
        where: {
          warehouseId: input.warehouseId,
          productId: input.productId,
          OR: input.q
            ? [
                { product: { sku: { contains: input.q, mode: "insensitive" } } },
                { product: { name: { contains: input.q, mode: "insensitive" } } }
              ]
            : undefined
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: pageItems.map(toStockItem),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  createGoodsReceipt: protectedProcedure
    .input(
      z.object({
        warehouseId: z.string().uuid(),
        sourceType: z.enum(["manual", "production_line_movement"]),
        sourceBatchId: z.string().nullable().optional(),
        receiptDate: z.string().datetime().optional(),
        notes: z.string().nullable().optional(),
        lines: z.array(goodsReceiptLineInputSchema).min(1)
      })
    )
    .output(
      z.object({
        id: z.string(),
        warehouseId: z.string(),
        sourceType: z.enum(["manual", "production_line_movement"]),
        sourceBatchId: z.string().nullable(),
        receiptDate: z.string(),
        notes: z.string().nullable(),
        createdAt: z.string(),
        lines: z.array(
          z.object({
            id: z.string(),
            productId: z.string(),
            qtyReceived: z.number().int()
          })
        )
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.warehouse.findUniqueOrThrow({ where: { id: input.warehouseId } }).catch(() => {
        throw apiError("BAD_REQUEST", "Invalid warehouseId");
      });

      const productIds = [...new Set(input.lines.map((line) => line.productId))];
      const productCount = await ctx.prisma.product.count({
        where: {
          id: { in: productIds }
        }
      });
      if (productCount !== productIds.length) {
        throw apiError("BAD_REQUEST", "One or more productIds are invalid");
      }

      const receipt = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.goodsReceipt.create({
          data: {
            warehouseId: input.warehouseId,
            sourceType: input.sourceType,
            sourceBatchId: input.sourceBatchId,
            receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
            notes: input.notes,
            lines: {
              create: input.lines.map((line) => ({
                productId: line.productId,
                qtyReceived: line.qtyReceived
              }))
            }
          },
          include: {
            lines: true
          }
        });

        for (const line of input.lines) {
          const existing = await tx.warehouseStock.findUnique({
            where: {
              warehouseId_productId: {
                warehouseId: input.warehouseId,
                productId: line.productId
              }
            }
          });

          if (!existing) {
            await tx.warehouseStock.create({
              data: {
                warehouseId: input.warehouseId,
                productId: line.productId,
                currentQty: line.qtyReceived
              }
            });
            continue;
          }

          await tx.warehouseStock.update({
            where: { id: existing.id },
            data: {
              currentQty: existing.currentQty + line.qtyReceived
            }
          });
        }

        return created;
      });

      return {
        id: receipt.id,
        warehouseId: receipt.warehouseId,
        sourceType: receipt.sourceType,
        sourceBatchId: receipt.sourceBatchId,
        receiptDate: receipt.receiptDate.toISOString(),
        notes: receipt.notes,
        createdAt: receipt.createdAt.toISOString(),
        lines: receipt.lines.map((line) => ({
          id: line.id,
          productId: line.productId,
          qtyReceived: line.qtyReceived
        }))
      };
    }),

  createStockAdjustment: protectedProcedure
    .input(stockAdjustmentInputSchema)
    .output(
      z.object({
        id: z.string(),
        warehouseId: z.string(),
        productId: z.string(),
        adjustmentQty: z.number().int(),
        reason: z.string(),
        adjustedById: z.string(),
        createdAt: z.string(),
        resultingQty: z.number().int()
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      const actorId = ctx.actor.id;

      await ctx.prisma.warehouse.findUniqueOrThrow({ where: { id: input.warehouseId } }).catch(() => {
        throw apiError("BAD_REQUEST", "Invalid warehouseId");
      });
      await ctx.prisma.product.findUniqueOrThrow({ where: { id: input.productId } }).catch(() => {
        throw apiError("BAD_REQUEST", "Invalid productId");
      });

      const created = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.warehouseStock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: input.warehouseId,
              productId: input.productId
            }
          }
        });

        const currentQty = existing?.currentQty ?? 0;
        const resultingQty = currentQty + input.adjustmentQty;
        if (resultingQty < 0) {
          throw apiError("CONFLICT", "Stock adjustment would result in negative currentQty");
        }

        if (!existing) {
          await tx.warehouseStock.create({
            data: {
              warehouseId: input.warehouseId,
              productId: input.productId,
              currentQty: resultingQty
            }
          });
        } else {
          await tx.warehouseStock.update({
            where: { id: existing.id },
            data: {
              currentQty: resultingQty
            }
          });
        }

        const adjustment = await tx.stockAdjustment.create({
          data: {
            warehouseId: input.warehouseId,
            productId: input.productId,
            adjustmentQty: input.adjustmentQty,
            reason: input.reason,
            adjustedById: actorId
          }
        });

        return {
          adjustment,
          resultingQty
        };
      });

      return {
        id: created.adjustment.id,
        warehouseId: created.adjustment.warehouseId,
        productId: created.adjustment.productId,
        adjustmentQty: created.adjustment.adjustmentQty,
        reason: created.adjustment.reason,
        adjustedById: created.adjustment.adjustedById,
        createdAt: created.adjustment.createdAt.toISOString(),
        resultingQty: created.resultingQty
      };
    })
});
