import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";

export const skuDemandRouter = createTRPCRouter({
  // Returns the most recent daily snapshot rows sorted by volume share descending.
  latest: perm("orders:read")
    .input(
      z
        .object({
          lookbackDays: z.number().int().min(1).max(365).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const lookbackDays = input?.lookbackDays ?? 30;

      // Find the most recent snapshotDate for this lookback window
      const latest = await ctx.prisma.skuDemandSnapshot.findFirst({
        where: { lookbackDays },
        orderBy: { snapshotDate: "desc" },
        select: { snapshotDate: true },
      });

      if (!latest) return { snapshotDate: null, lookbackDays, rows: [] };

      const rows = await ctx.prisma.skuDemandSnapshot.findMany({
        where: { snapshotDate: latest.snapshotDate, lookbackDays },
        orderBy: { volumeSharePct: "desc" },
        include: { product: { select: { name: true, displayName: true } } },
      });

      return {
        snapshotDate: latest.snapshotDate,
        lookbackDays,
        rows: rows.map((r) => ({
          productId: r.productId,
          sku: r.sku,
          productName: r.product.displayName ?? r.product.name,
          orderFrequencyPct: r.orderFrequencyPct,
          volumeSharePct: r.volumeSharePct,
          meanDailyQty: r.meanDailyQty,
          orderCount: r.orderCount,
          totalOrdersInWindow: r.totalOrdersInWindow,
          totalQtyOrdered: r.totalQtyOrdered,
          totalAllSkuQty: r.totalAllSkuQty,
        })),
      };
    }),

  // Returns daily volumeSharePct trend for a single product over the past N days.
  trend: perm("orders:read")
    .input(
      z.object({
        productId: z.string(),
        lookbackDays: z.number().int().min(1).max(365).optional(),
        days: z.number().int().min(1).max(90).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const lookbackDays = input.lookbackDays ?? 30;
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (input.days ?? 30));

      const rows = await ctx.prisma.skuDemandSnapshot.findMany({
        where: {
          productId: input.productId,
          lookbackDays,
          snapshotDate: { gte: since },
        },
        orderBy: { snapshotDate: "asc" },
        select: {
          snapshotDate: true,
          volumeSharePct: true,
          orderFrequencyPct: true,
          meanDailyQty: true,
          orderCount: true,
          totalOrdersInWindow: true,
        },
      });

      return { productId: input.productId, lookbackDays, rows };
    }),
});
