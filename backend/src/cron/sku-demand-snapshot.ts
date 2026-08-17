import { prisma } from "../infra/db/prisma";
import { acquireLock, sweepStaleLocks } from "./cron-lock";

interface SkuRow {
  productId: string;
  sku: string;
  orderCount: number;
  totalQty: number;
}

interface OrderCountRow {
  total: bigint;
}

async function run() {
  const snapshotDate = new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  const runKey = snapshotDate.toISOString().slice(0, 10);
  const got = await acquireLock("sku-demand-snapshot", runKey);
  if (!got) {
    console.warn(`[sku-demand-snapshot] lock already held for ${runKey}, skipping`);
    return;
  }

  const lookbackDays = parseInt(process.env.DEMAND_LOOKBACK_DAYS ?? "30", 10);
  const windowStart = new Date(snapshotDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - lookbackDays);

  const [skuRows, orderCountRows] = await Promise.all([
    prisma.$queryRaw<SkuRow[]>`
      SELECT
        sol."productId",
        sol."sku",
        COUNT(DISTINCT sol."orderId")::int AS "orderCount",
        SUM(sol."qtyOrdered")::int         AS "totalQty"
      FROM sale_order_lines sol
      JOIN sale_orders so ON sol."orderId" = so."id"
      WHERE so."orderDate" >= ${windowStart}
        AND so."status" NOT IN ('rejected', 'cancelled')
      GROUP BY sol."productId", sol."sku"
    `,
    prisma.$queryRaw<OrderCountRow[]>`
      SELECT COUNT(DISTINCT id) AS total
      FROM sale_orders
      WHERE "orderDate" >= ${windowStart}
        AND "status" NOT IN ('rejected', 'cancelled')
    `,
  ]);

  const totalOrdersInWindow = Number(orderCountRows[0]?.total ?? 0);
  const totalAllSkuQty = skuRows.reduce((sum, r) => sum + r.totalQty, 0);

  if (skuRows.length === 0 || totalAllSkuQty === 0) {
    console.log(`[sku-demand-snapshot] no order data in window, skipping upsert`);
    await sweepStaleLocks();
    return;
  }

  for (const row of skuRows) {
    const orderFrequencyPct =
      totalOrdersInWindow > 0 ? (row.orderCount / totalOrdersInWindow) * 100 : 0;
    const volumeSharePct =
      totalAllSkuQty > 0 ? (row.totalQty / totalAllSkuQty) * 100 : 0;
    const meanDailyQty = row.totalQty / lookbackDays;

    await prisma.skuDemandSnapshot.upsert({
      where: {
        snapshotDate_productId_lookbackDays: {
          snapshotDate,
          productId: row.productId,
          lookbackDays,
        },
      },
      create: {
        snapshotDate,
        productId: row.productId,
        sku: row.sku,
        lookbackDays,
        orderCount: row.orderCount,
        totalOrdersInWindow,
        totalQtyOrdered: row.totalQty,
        totalAllSkuQty,
        orderFrequencyPct,
        volumeSharePct,
        meanDailyQty,
      },
      update: {
        sku: row.sku,
        orderCount: row.orderCount,
        totalOrdersInWindow,
        totalQtyOrdered: row.totalQty,
        totalAllSkuQty,
        orderFrequencyPct,
        volumeSharePct,
        meanDailyQty,
      },
    });
  }

  console.log(
    `[sku-demand-snapshot] upserted ${skuRows.length} SKUs for ${runKey}` +
      ` (window: ${lookbackDays}d, orders: ${totalOrdersInWindow}, units: ${totalAllSkuQty})`
  );

  await sweepStaleLocks();
}

export default run;

if (import.meta.main) {
  run()
    .then(() => {
      console.log("[sku-demand-snapshot] done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[sku-demand-snapshot] fatal:", err);
      process.exit(1);
    });
}
