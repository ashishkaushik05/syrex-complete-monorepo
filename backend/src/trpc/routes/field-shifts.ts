import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";

const shiftSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  orgId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  startType: z.enum(["auto", "manual"]),
  endType: z.enum(["auto", "manual", "extended"]).nullable(),
  status: z.enum(["active", "completed"])
});

const SHIFT_SELECT = {
  id: true,
  agentId: true,
  orgId: true,
  startedAt: true,
  endedAt: true,
  startType: true,
  endType: true,
  status: true
} as const;

function toShift(s: {
  id: string;
  agentId: string;
  orgId: string;
  startedAt: Date;
  endedAt: Date | null;
  startType: "auto" | "manual";
  endType: "auto" | "manual" | "extended" | null;
  status: "active" | "completed";
}) {
  return {
    ...s,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null
  };
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function upsertAttendance(
  prisma: PrismaClient,
  userId: string,
  orgId: string
) {
  const date = todayUtc();
  await prisma.dailyAttendance.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, orgId, date, status: "present" },
    update: {}
  });
}

async function inferOrgIdForShiftStart(
  prisma: PrismaClient,
  agentId: string
) {
  const actorScopedHints = await Promise.all([
    prisma.shift.findFirst({
      where: { agentId },
      orderBy: { startedAt: "desc" },
      select: { orgId: true }
    }),
    prisma.shiftSchedule.findFirst({
      where: { userId: agentId },
      orderBy: { updatedAt: "desc" },
      select: { orgId: true }
    }),
    prisma.dailyAttendance.findFirst({
      where: { userId: agentId },
      orderBy: { date: "desc" },
      select: { orgId: true }
    }),
    prisma.fieldLocation.findFirst({
      where: { agentId },
      orderBy: { recordedAt: "desc" },
      select: { orgId: true }
    }),
    prisma.fieldVisit.findFirst({
      where: { agentId },
      orderBy: { recordedAt: "desc" },
      select: { orgId: true }
    }),
    prisma.fieldStop.findFirst({
      where: { agentId },
      orderBy: { startedAt: "desc" },
      select: { orgId: true }
    })
  ]);

  for (const hint of actorScopedHints) {
    if (hint?.orgId) return hint.orgId;
  }

  const globalOrgRows = await Promise.all([
    prisma.shift.findMany({ select: { orgId: true }, distinct: ["orgId"], take: 2 }),
    prisma.shiftSchedule.findMany({ select: { orgId: true }, distinct: ["orgId"], take: 2 }),
    prisma.dailyAttendance.findMany({ select: { orgId: true }, distinct: ["orgId"], take: 2 }),
    prisma.fieldLocation.findMany({ select: { orgId: true }, distinct: ["orgId"], take: 2 }),
    prisma.fieldVisit.findMany({ select: { orgId: true }, distinct: ["orgId"], take: 2 }),
    prisma.fieldStop.findMany({ select: { orgId: true }, distinct: ["orgId"], take: 2 })
  ]);

  const orgIds = new Set<string>();
  for (const rows of globalOrgRows) {
    for (const row of rows) {
      if (row.orgId) orgIds.add(row.orgId);
    }
  }

  if (orgIds.size === 1) {
    return [...orgIds][0];
  }
  if (orgIds.size > 1) {
    throw apiError("BAD_REQUEST", "orgId required: multiple organizations detected");
  }
  // Single-tenant deployment with no field records yet — use the env default.
  return process.env.DEFAULT_ORG_ID ?? "default";
}

export const fieldShiftsRouter = createTRPCRouter({
  start: perm(P.field.write)
    .input(z.object({ orgId: z.string().optional() }))
    .output(shiftSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      const orgId = input.orgId ?? ctx.actor.orgId ?? (await inferOrgIdForShiftStart(ctx.prisma, agentId));
      if (!orgId) {
        throw apiError(
          "BAD_REQUEST",
          "orgId required: provide x-org-id or orgId in request input"
        );
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: agentId },
        select: { isFieldEnabled: true, userType: true }
      });
      if (!user?.isFieldEnabled) {
        throw apiError("FORBIDDEN", "Field Sense not enabled for this user");
      }

      const existing = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active" }
      });
      if (existing) throw apiError("CONFLICT", "Active shift already exists");

      const shift = await ctx.prisma.shift.create({
        data: { agentId, orgId, startType: "manual", status: "active" },
        select: SHIFT_SELECT
      });

      await upsertAttendance(ctx.prisma, agentId, orgId);
      return toShift(shift);
    }),

  end: perm(P.field.write)
    .input(z.object({}))
    .output(shiftSchema)
    .mutation(async ({ ctx }) => {
      const agentId = ctx.actor.id!;
      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active" }
      });
      if (!shift) throw apiError("NOT_FOUND", "No active shift");

      const updated = await ctx.prisma.shift.update({
        where: { id: shift.id },
        data: { endedAt: new Date(), endType: "manual", status: "completed" },
        select: SHIFT_SELECT
      });
      return toShift(updated);
    }),

  extend: perm(P.field.write)
    .input(z.object({}))
    .output(shiftSchema)
    .mutation(async ({ ctx }) => {
      const agentId = ctx.actor.id!;
      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active" }
      });
      if (!shift) throw apiError("NOT_FOUND", "No active shift");

      const updated = await ctx.prisma.shift.update({
        where: { id: shift.id },
        data: { endType: "extended" },
        select: SHIFT_SELECT
      });
      return toShift(updated);
    }),

  active: perm(P.field.read)
    .input(z.object({}))
    .output(shiftSchema.nullable())
    .query(async ({ ctx }) => {
      const agentId = ctx.actor.id!;
      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active" },
        select: SHIFT_SELECT
      });
      return shift ? toShift(shift) : null;
    }),

  list: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        orgId: z.string().optional(),
        status: z.enum(["active", "completed"]).optional(),
        date: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    )
    .output(z.array(shiftSchema))
    .query(async ({ ctx, input }) => {
      const dateFilter = input.date
        ? {
            startedAt: {
              gte: new Date(`${input.date}T00:00:00.000Z`),
              lt: new Date(`${input.date}T23:59:59.999Z`)
            }
          }
        : {};
      const shifts = await ctx.prisma.shift.findMany({
        where: {
          agentId: input.agentId,
          orgId: input.orgId,
          status: input.status,
          ...dateFilter
        },
        select: SHIFT_SELECT,
        orderBy: { startedAt: "desc" },
        take: input.limit
      });
      return shifts.map(toShift);
    })
});

export { upsertAttendance };
