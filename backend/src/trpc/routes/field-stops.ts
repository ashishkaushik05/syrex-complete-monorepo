import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertCanReadAgent, assertFieldEnabled } from "./field-helpers";

const stopSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  shiftId: z.string(),
  orgId: z.string(),
  lat: z.number(),
  lng: z.number(),
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  clientEventId: z.string().nullable().optional(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  createdAt: z.string()
});

const STOP_SELECT = {
  id: true,
  agentId: true,
  shiftId: true,
  orgId: true,
  lat: true,
  lng: true,
  reason: true,
  notes: true,
  clientEventId: true,
  startedAt: true,
  endedAt: true,
  createdAt: true
} as const;

function toStop(s: {
  id: string;
  agentId: string;
  shiftId: string;
  orgId: string;
  lat: number;
  lng: number;
  reason: string | null;
  notes: string | null;
  clientEventId?: string | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...s,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString()
  };
}

export const fieldStopsRouter = createTRPCRouter({
  start: perm(P.field.write)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        // P1-2: shiftId allows offline replay into a specific (possibly closed) shift.
        shiftId: z.string().uuid().optional(),
        lat: z.number(),
        lng: z.number(),
        reason: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
        startedAt: z.string().datetime().optional(),
        clientEventId: z.string().min(1).optional()
      })
    )
    .output(stopSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      await assertFieldEnabled(ctx.prisma, agentId);
      // H-11: a client-provided agentId must match the actor. Check BEFORE the
      // shift lookup so a spoofed agentId cannot be used to probe other shifts.
      if (input.agentId && input.agentId !== agentId) {
        throw apiError(
          "FORBIDDEN",
          "Cannot create records on another agent's shift"
        );
      }
      // P1-2: If shiftId is provided, validate it belongs to this agent/org and
      // use it directly (allows offline replay into closed shifts). Otherwise fall
      // back to the current active shift.
      const shift = input.shiftId
        ? await ctx.prisma.shift.findFirst({
            where: {
              id: input.shiftId,
              agentId,
              ...(ctx.actor.orgId ? { orgId: ctx.actor.orgId } : {})
            },
            select: { id: true, orgId: true }
          })
        : await ctx.prisma.shift.findFirst({
            where: { agentId, ...(ctx.actor.orgId ? { orgId: ctx.actor.orgId } : {}), status: "active" },
            select: { id: true, orgId: true }
          });
      if (!shift) throw apiError("BAD_REQUEST", input.shiftId ? "Shift not found or not accessible" : "No active shift — stops require an active shift");
      const orgId = shift.orgId;

      if (input.clientEventId) {
        // P0-4: Scope duplicate check to org — same clientEventId across different orgs is allowed.
        const existing = await ctx.prisma.fieldStop.findUnique({
          where: {
            orgId_clientEventId: {
              orgId,
              clientEventId: input.clientEventId
            }
          },
          select: STOP_SELECT
        });
        if (existing) return toStop(existing);
      }

      const openStop = await ctx.prisma.fieldStop.findFirst({
        where: { agentId, orgId, endedAt: null },
        select: { id: true }
      });
      if (openStop) throw apiError("BAD_REQUEST", "A stop is already open — end it before starting another");

      const stop = await ctx.prisma.fieldStop.create({
        data: {
          agentId,
          shiftId: shift.id,
          orgId: shift.orgId,
          lat: input.lat,
          lng: input.lng,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          clientEventId: input.clientEventId ?? null,
          startedAt: input.startedAt ? new Date(input.startedAt) : new Date()
        },
        select: STOP_SELECT
      });
      return toStop(stop);
    }),

  end: perm(P.field.write)
    .input(
      z.object({
        stopId: z.string().uuid(),
        notes: z.string().min(1).optional(),
        endedAt: z.string().datetime().optional()
      })
    )
    .output(stopSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      await assertFieldEnabled(ctx.prisma, agentId);

      // Resolve orgId from the stop record itself.
      const stopRecord = await ctx.prisma.fieldStop.findUnique({
        where: { id: input.stopId },
        select: { orgId: true, agentId: true }
      });
      if (!stopRecord || stopRecord.agentId !== agentId) {
        throw new TRPCError({ code: "CONFLICT", message: "Stop not found or already ended" });
      }
      const orgId = stopRecord.orgId;

      let stop;
      try {
        stop = await ctx.prisma.fieldStop.update({
          where: { id: input.stopId, agentId, orgId, endedAt: null },
          data: {
            endedAt: input.endedAt ? new Date(input.endedAt) : new Date(),
            notes: input.notes ?? undefined
          },
          select: STOP_SELECT
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2025"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Stop not found or already ended"
          });
        }
        throw err;
      }
      return toStop(stop);
    }),

  list: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        shiftId: z.string().uuid().optional(),
        date: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        openOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(50)
      })
    )
    .output(z.array(stopSchema))
    .query(async ({ ctx, input }) => {
      if (input.agentId) assertCanReadAgent(ctx, input.agentId);
      const orgId = ctx.actor.orgId ?? undefined;
      const timeFilter: Record<string, Date> = {};
      if (input.from) timeFilter.gte = new Date(input.from);
      if (input.to) timeFilter.lte = new Date(input.to);

      let dateWhere = {};
      if (input.date && !input.from && !input.to) {
        dateWhere = {
          startedAt: {
            gte: new Date(`${input.date}T00:00:00.000Z`),
            lt: new Date(`${input.date}T23:59:59.999Z`)
          }
        };
      } else if (Object.keys(timeFilter).length > 0) {
        dateWhere = { startedAt: timeFilter };
      }

      const stops = await ctx.prisma.fieldStop.findMany({
        where: {
          orgId,
          agentId: input.agentId,
          shiftId: input.shiftId,
          endedAt: input.openOnly ? null : undefined,
          ...dateWhere
        },
        select: STOP_SELECT,
        orderBy: { startedAt: "desc" },
        take: input.limit
      });
      return stops.map(toStop);
    }),

  active: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid().optional()
      })
    )
    .output(stopSchema.nullable())
    .query(async ({ ctx, input }) => {
      const callerId = ctx.actor.id!;
      const targetAgentId = input.agentId ?? callerId;
      assertCanReadAgent(ctx, targetAgentId);
      // orgId is optional for own-agent queries — without it we search across all orgs.
      const orgId = ctx.actor.orgId ?? undefined;

      const stop = await ctx.prisma.fieldStop.findFirst({
        where: { agentId: targetAgentId, ...(orgId ? { orgId } : {}), endedAt: null },
        select: STOP_SELECT,
        orderBy: { startedAt: "desc" }
      });
      return stop ? toStop(stop) : null;
    })
});
