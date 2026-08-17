import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, internalPerm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { SERVICE_STATUS_VALUES } from "./service-shared";

const SERVICE_STATUS_LITERALS = SERVICE_STATUS_VALUES;

// Batch 04: refuse null actor orgId rather than silently widening filters.
function requireOrgId(actorOrgId: string | null): string {
  if (!actorOrgId) {
    throw apiError("FORBIDDEN", "Org context required");
  }
  return actorOrgId;
}

const analyticsRangeInput = z.object({
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

type RangeInput = z.infer<typeof analyticsRangeInput>;

function createdAtRange(input: RangeInput): Prisma.DateTimeFilter | undefined {
  if (!input.fromDate && !input.toDate) return undefined;
  return {
    ...(input.fromDate ? { gte: input.fromDate } : {}),
    ...(input.toDate ? { lte: input.toDate } : {}),
  };
}

export const serviceAnalyticsRouter = createTRPCRouter({
  dashboard: internalPerm(P.service.analytics)
    .input(analyticsRangeInput.optional())
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const range = createdAtRange(input ?? {});
      const baseWhere: Prisma.ServiceComplaintWhereInput = {
        orgId,
        ...(range ? { createdAt: range } : {}),
      };

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const since = (ms: number) => new Date(now - ms);

      const [
        statusGroups,
        resolutionAgg,
        raised24h,
        raised7d,
        raised30d,
        closed24h,
        closed7d,
        closed30d,
        topOutletRows,
        topProductGroups,
      ] = await Promise.all([
        ctx.prisma.serviceComplaint.groupBy({
          by: ["status"],
          where: baseWhere,
          _count: { _all: true },
        }),
        ctx.prisma.$queryRaw<[{ avg_days: number | null }]>`
          SELECT AVG(EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 86400)::float AS avg_days
          FROM service_complaints
          WHERE "orgId" = ${orgId} AND "closedAt" IS NOT NULL
        `,
        ctx.prisma.serviceComplaint.count({ where: { orgId, createdAt: { gte: since(day) } } }),
        ctx.prisma.serviceComplaint.count({ where: { orgId, createdAt: { gte: since(7 * day) } } }),
        ctx.prisma.serviceComplaint.count({ where: { orgId, createdAt: { gte: since(30 * day) } } }),
        ctx.prisma.serviceComplaint.count({ where: { orgId, closedAt: { gte: since(day) } } }),
        ctx.prisma.serviceComplaint.count({ where: { orgId, closedAt: { gte: since(7 * day) } } }),
        ctx.prisma.serviceComplaint.count({ where: { orgId, closedAt: { gte: since(30 * day) } } }),
        ctx.prisma.$queryRaw<Array<{ outletId: string; outletName: string; count: bigint }>>`
          SELECT o.id AS "outletId", o.name AS "outletName", COUNT(DISTINCT sc.id) AS count
          FROM service_complaints sc
          JOIN service_complaint_lines scl ON scl."complaintId" = sc.id
          JOIN service_serial_index ssi ON ssi."normalizedSerial" = scl."normalizedSerial"
          JOIN outlets o ON o.id = ssi."soldOutletId"
          WHERE sc."orgId" = ${orgId}
            AND sc.status IN ('raised','assigned','visit','test_result_submitted','retest_requested')
          GROUP BY o.id, o.name
          ORDER BY count DESC
          LIMIT 5
        `,
        ctx.prisma.serviceComplaintLine.groupBy({
          by: ["productId"],
          where: {
            productId: { not: null },
            complaint: { orgId, createdAt: { gte: since(90 * day) } },
          },
          _count: { _all: true },
          orderBy: { _count: { productId: "desc" } },
          take: 5,
        }),
      ]);

      const statusCounts: Record<string, number> = {};
      let total = 0;
      for (const g of statusGroups) {
        statusCounts[g.status] = g._count._all;
        total += g._count._all;
      }

      const productIds = topProductGroups.map((g) => g.productId!).filter(Boolean);
      const products = productIds.length
        ? await ctx.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, sku: true, name: true },
          })
        : [];
      const productById = new Map(products.map((p) => [p.id, p]));

      return {
        total,
        statusCounts,
        avgResolutionDays: resolutionAgg[0]?.avg_days ?? null,
        raised: { last24h: raised24h, last7d: raised7d, last30d: raised30d },
        closed: { last24h: closed24h, last7d: closed7d, last30d: closed30d },
        topOpenOutlets: topOutletRows.map((r) => ({
          outletId: r.outletId,
          outletName: r.outletName,
          openComplaints: Number(r.count),
        })),
        topProducts: topProductGroups.map((g) => ({
          productId: g.productId,
          sku: productById.get(g.productId!)?.sku ?? null,
          name: productById.get(g.productId!)?.name ?? null,
          complaints: g._count._all,
        })),
      };
    }),

  resolutionTime: internalPerm(P.service.analytics)
    .input(analyticsRangeInput.extend({ sku: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const rows = await ctx.prisma.$queryRaw<
        Array<{ sku: string; avg_days: number | null; closed_count: bigint }>
      >`
        SELECT scl.sku AS sku,
               AVG(EXTRACT(EPOCH FROM (sc."closedAt" - sc."createdAt")) / 86400)::float AS avg_days,
               COUNT(DISTINCT sc.id) AS closed_count
        FROM service_complaints sc
        JOIN service_complaint_lines scl ON scl."complaintId" = sc.id
        WHERE sc."orgId" = ${orgId}
          AND sc."closedAt" IS NOT NULL
          ${input.fromDate ? Prisma.sql`AND sc."createdAt" >= ${input.fromDate}` : Prisma.empty}
          ${input.toDate ? Prisma.sql`AND sc."createdAt" <= ${input.toDate}` : Prisma.empty}
          ${input.sku ? Prisma.sql`AND scl.sku = ${input.sku}` : Prisma.empty}
        GROUP BY scl.sku
        ORDER BY avg_days DESC NULLS LAST
      `;
      return {
        items: rows.map((r) => ({
          sku: r.sku,
          avgResolutionDays: r.avg_days,
          closedComplaints: Number(r.closed_count),
        })),
      };
    }),

  byGeography: internalPerm(P.service.analytics)
    .input(analyticsRangeInput)
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const range = createdAtRange(input);
      const groups = await ctx.prisma.serviceComplaint.groupBy({
        by: ["customerState"],
        where: {
          orgId,
          customerState: { not: null },
          ...(range ? { createdAt: range } : {}),
        },
        _count: { _all: true },
        orderBy: { _count: { customerState: "desc" } },
      });
      return {
        items: groups.map((g) => ({ state: g.customerState!, count: g._count._all })),
      };
    }),

  byOutlet: internalPerm(P.service.analytics)
    .input(analyticsRangeInput.extend({ status: z.enum(SERVICE_STATUS_LITERALS).optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const rows = await ctx.prisma.$queryRaw<
        Array<{ outletId: string; outletName: string; count: bigint }>
      >`
        SELECT o.id AS "outletId", o.name AS "outletName", COUNT(DISTINCT sc.id) AS count
        FROM service_complaints sc
        JOIN service_complaint_lines scl ON scl."complaintId" = sc.id
        JOIN service_serial_index ssi ON ssi."normalizedSerial" = scl."normalizedSerial"
        JOIN outlets o ON o.id = ssi."soldOutletId"
        WHERE sc."orgId" = ${orgId}
          ${input.status ? Prisma.sql`AND sc.status = ${input.status}::"ServiceComplaintStatus"` : Prisma.empty}
          ${input.fromDate ? Prisma.sql`AND sc."createdAt" >= ${input.fromDate}` : Prisma.empty}
          ${input.toDate ? Prisma.sql`AND sc."createdAt" <= ${input.toDate}` : Prisma.empty}
        GROUP BY o.id, o.name
        ORDER BY count DESC
      `;
      return {
        items: rows.map((r) => ({
          outletId: r.outletId,
          outletName: r.outletName,
          count: Number(r.count),
        })),
      };
    }),

  byProduct: internalPerm(P.service.analytics)
    .input(analyticsRangeInput.extend({ status: z.enum(SERVICE_STATUS_LITERALS).optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const range = createdAtRange(input);
      const groups = await ctx.prisma.serviceComplaintLine.groupBy({
        by: ["productId", "sku"],
        where: {
          productId: { not: null },
          complaint: {
            orgId,
            ...(input.status ? { status: input.status } : {}),
            ...(range ? { createdAt: range } : {}),
          },
        },
        _count: { _all: true },
        orderBy: { _count: { productId: "desc" } },
      });
      return {
        items: groups.map((g) => ({
          productId: g.productId,
          sku: g.sku,
          count: g._count._all,
        })),
      };
    }),

  byCauseOfFailure: internalPerm(P.service.analytics)
    .input(analyticsRangeInput)
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const range = createdAtRange(input);
      const groups = await ctx.prisma.serviceTestReport.groupBy({
        by: ["causeOfFailure"],
        where: {
          causeOfFailure: { not: null },
          complaint: { orgId },
          ...(range ? { createdAt: range } : {}),
        },
        _count: { _all: true },
        orderBy: { _count: { causeOfFailure: "desc" } },
      });
      return {
        items: groups.map((g) => ({ cause: g.causeOfFailure!, count: g._count._all })),
      };
    }),

  warrantyFunnel: internalPerm(P.service.analytics)
    .input(analyticsRangeInput)
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const range = createdAtRange(input);
      const complaintWhere: Prisma.ServiceComplaintWhereInput = {
        orgId,
        ...(range ? { createdAt: range } : {}),
      };
      const decisionWhere: Prisma.ServiceWarrantyDecisionWhereInput = {
        complaint: complaintWhere,
      };

      const [totalComplaints, warrantyCandidates, approved, rejected, proRataDecisions] =
        await Promise.all([
          ctx.prisma.serviceComplaint.count({ where: complaintWhere }),
          ctx.prisma.serviceTestReport.count({
            where: { verdict: "warranty_candidate", complaint: complaintWhere },
          }),
          ctx.prisma.serviceWarrantyDecision.count({
            where: { ...decisionWhere, status: "approved" },
          }),
          ctx.prisma.serviceWarrantyDecision.count({
            where: { ...decisionWhere, status: "rejected" },
          }),
          ctx.prisma.serviceWarrantyDecision.findMany({
            where: { ...decisionWhere, status: "approved", proRataPercent: { not: null } },
            select: { proRataPercent: true },
          }),
        ]);

      let full = 0;
      let partial = 0;
      for (const d of proRataDecisions) {
        if (d.proRataPercent === 100) full += 1;
        else partial += 1;
      }

      return {
        totalComplaints,
        warrantyCandidates,
        approved,
        rejected,
        proRataBreakdown: { full, partial },
      };
    }),

  openAgeDistribution: internalPerm(P.service.analytics)
    .query(async ({ ctx }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const rows = await ctx.prisma.$queryRaw<
        Array<{ bucket: string; count: bigint }>
      >`
        SELECT bucket, COUNT(*) AS count FROM (
          SELECT CASE
            WHEN EXTRACT(EPOCH FROM (now() - "createdAt")) / 86400 < 7 THEN 'lt_7'
            WHEN EXTRACT(EPOCH FROM (now() - "createdAt")) / 86400 < 30 THEN '7_30'
            WHEN EXTRACT(EPOCH FROM (now() - "createdAt")) / 86400 < 90 THEN '30_90'
            ELSE 'gt_90'
          END AS bucket
          FROM service_complaints
          WHERE "orgId" = ${orgId}
            AND status IN ('raised','assigned','visit','test_result_submitted','retest_requested')
        ) t
        GROUP BY bucket
      `;
      const dist = { lt_7: 0, "7_30": 0, "30_90": 0, gt_90: 0 } as Record<string, number>;
      for (const r of rows) dist[r.bucket] = Number(r.count);
      return dist;
    }),
});
