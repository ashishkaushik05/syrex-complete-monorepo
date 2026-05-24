import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertCanReadAgent, resolveReadOrgId } from "./field-helpers";

const visitSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  shiftId: z.string(),
  orgId: z.string(),
  lat: z.number(),
  lng: z.number(),
  description: z.string().nullable(),
  audioUrl: z.string().nullable(),
  outletId: z.string().nullable(),
  customerId: z.string().nullable(),
  recordedAt: z.string(),
  createdAt: z.string()
});

const VISIT_SELECT = {
  id: true,
  agentId: true,
  shiftId: true,
  orgId: true,
  lat: true,
  lng: true,
  description: true,
  audioUrl: true,
  outletId: true,
  customerId: true,
  recordedAt: true,
  createdAt: true
} as const;

function toVisit(v: {
  id: string;
  agentId: string;
  shiftId: string;
  orgId: string;
  lat: number;
  lng: number;
  description: string | null;
  audioUrl: string | null;
  outletId: string | null;
  customerId: string | null;
  recordedAt: Date;
  createdAt: Date;
}) {
  return {
    ...v,
    recordedAt: v.recordedAt.toISOString(),
    createdAt: v.createdAt.toISOString()
  };
}

export const fieldVisitsRouter = createTRPCRouter({
  log: perm(P.field.write)
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        description: z.string().min(1).optional(),
        audioUrl: z.string().url().optional(),
        outletId: z.string().uuid().optional(),
        customerId: z.string().uuid().optional(),
        recordedAt: z.string().datetime().optional()
      })
    )
    .output(visitSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      const orgId = ctx.actor.orgId;
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, orgId, status: "active" },
        select: { id: true, orgId: true }
      });
      if (!shift) throw apiError("BAD_REQUEST", "No active shift — visits require an active shift");

      if (input.outletId) {
        const outlet = await ctx.prisma.outlet.findFirst({
          where: { id: input.outletId, isActive: true, orgId: shift.orgId },
          select: { id: true, userId: true }
        });
        if (!outlet) throw apiError("BAD_REQUEST", "Outlet not found or inactive");

        if (input.customerId) {
          const customer = await ctx.prisma.user.findFirst({
            where: { id: input.customerId, isActive: true, userType: "outlet", orgId: shift.orgId },
            select: { id: true }
          });
          if (!customer) throw apiError("BAD_REQUEST", "Customer not found or inactive");
          if (customer.id !== outlet.userId) {
            throw apiError("BAD_REQUEST", "Customer does not belong to selected outlet");
          }
        }
      }

      const visit = await ctx.prisma.fieldVisit.create({
        data: {
          agentId,
          shiftId: shift.id,
          orgId: shift.orgId,
          lat: input.lat,
          lng: input.lng,
          description: input.description ?? null,
          audioUrl: input.audioUrl ?? null,
          outletId: input.outletId ?? null,
          customerId: input.customerId ?? null,
          recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date()
        },
        select: VISIT_SELECT
      });
      return toVisit(visit);
    }),

  list: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        shiftId: z.string().uuid().optional(),
        date: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    )
    .output(z.array(visitSchema))
    .query(async ({ ctx, input }) => {
      if (input.agentId) assertCanReadAgent(ctx, input.agentId);
      const orgId = resolveReadOrgId(ctx);
      const timeFilter: Record<string, Date> = {};
      if (input.from) timeFilter.gte = new Date(input.from);
      if (input.to) timeFilter.lte = new Date(input.to);

      let dateWhere = {};
      if (input.date && !input.from && !input.to) {
        dateWhere = {
          recordedAt: {
            gte: new Date(`${input.date}T00:00:00.000Z`),
            lt: new Date(`${input.date}T23:59:59.999Z`)
          }
        };
      } else if (Object.keys(timeFilter).length > 0) {
        dateWhere = { recordedAt: timeFilter };
      }

      const visits = await ctx.prisma.fieldVisit.findMany({
        where: {
          orgId,
          agentId: input.agentId,
          shiftId: input.shiftId,
          ...dateWhere
        },
        select: VISIT_SELECT,
        orderBy: { recordedAt: "desc" },
        take: input.limit
      });
      return visits.map(toVisit);
    }),

  forShift: perm(P.field.read)
    .input(z.object({ shiftId: z.string().uuid() }))
    .output(z.array(visitSchema))
    .query(async ({ ctx, input }) => {
      const orgId = resolveReadOrgId(ctx);
      const visits = await ctx.prisma.fieldVisit.findMany({
        where: { shiftId: input.shiftId, orgId },
        select: VISIT_SELECT,
        orderBy: { recordedAt: "asc" }
      });
      return visits.map(toVisit);
    })
});
