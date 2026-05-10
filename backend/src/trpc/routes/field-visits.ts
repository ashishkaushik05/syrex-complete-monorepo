import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";

const visitSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  shiftId: z.string(),
  orgId: z.string(),
  lat: z.number(),
  lng: z.number(),
  description: z.string().nullable(),
  audioUrl: z.string().nullable(),
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
  log: perm("field:write")
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        description: z.string().optional(),
        audioUrl: z.string().url().optional(),
        recordedAt: z.string().datetime().optional()
      })
    )
    .output(visitSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;

      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active" },
        select: { id: true, orgId: true }
      });
      if (!shift) throw apiError("BAD_REQUEST", "No active shift — visits require an active shift");

      const visit = await ctx.prisma.fieldVisit.create({
        data: {
          agentId,
          shiftId: shift.id,
          orgId: shift.orgId,
          lat: input.lat,
          lng: input.lng,
          description: input.description ?? null,
          audioUrl: input.audioUrl ?? null,
          recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date()
        },
        select: VISIT_SELECT
      });
      return toVisit(visit);
    }),

  list: perm("field:read")
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

  forShift: perm("field:read")
    .input(z.object({ shiftId: z.string().uuid() }))
    .output(z.array(visitSchema))
    .query(async ({ ctx, input }) => {
      const visits = await ctx.prisma.fieldVisit.findMany({
        where: { shiftId: input.shiftId },
        select: VISIT_SELECT,
        orderBy: { recordedAt: "asc" }
      });
      return visits.map(toVisit);
    })
});
