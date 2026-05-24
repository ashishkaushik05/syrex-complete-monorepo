import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { resolveReadOrgId } from "./field-helpers";

const shiftSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  orgId: z.string(),
  clientShiftId: z.string().nullable().optional(),
  syncState: z.string().nullable().optional(),
  clientStartedAt: z.string().nullable().optional(),
  clientEndedAt: z.string().nullable().optional(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  startType: z.enum(["auto", "manual"]),
  endType: z.enum(["auto", "manual", "extended"]).nullable(),
  status: z.enum(["active", "completed"])
});

const syncShiftSchema = z.object({
  shift: shiftSchema,
  serverShiftId: z.string(),
  clientShiftId: z.string(),
  status: z.enum(["created", "existing", "reconciled", "completed"])
});

const SHIFT_SELECT = {
  id: true,
  agentId: true,
  orgId: true,
  clientShiftId: true,
  syncState: true,
  clientStartedAt: true,
  clientEndedAt: true,
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
  clientShiftId?: string | null;
  syncState?: string | null;
  clientStartedAt?: Date | null;
  clientEndedAt?: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  startType: "auto" | "manual";
  endType: "auto" | "manual" | "extended" | null;
  status: "active" | "completed";
}) {
  return {
    ...s,
    clientStartedAt: s.clientStartedAt?.toISOString() ?? null,
    clientEndedAt: s.clientEndedAt?.toISOString() ?? null,
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
  orgId: string,
  attendedAt = new Date()
) {
  const date = attendedAt.toISOString().slice(0, 10) || todayUtc();
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

async function assertFieldEnabled(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isFieldEnabled: true, userType: true }
  });
  if (!user?.isFieldEnabled) {
    throw apiError("FORBIDDEN", "Field Sense not enabled for this user");
  }
  if (user.userType !== "internal") {
    throw apiError("FORBIDDEN", "Field Sense is only available to internal users");
  }
}

function parseClientDate(value: string, fieldName: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw apiError("BAD_REQUEST", `${fieldName} must be a valid ISO datetime`);
  }
  return date;
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

      await assertFieldEnabled(ctx.prisma, agentId);

      const shift = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.shift.findFirst({
          where: { agentId, orgId, status: "active" }
        });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Active shift already exists" });
        }
        const newShift = await tx.shift.create({
          data: { agentId, orgId, startType: "manual", status: "active" },
          select: SHIFT_SELECT
        });
        const date = new Date().toISOString().slice(0, 10);
        await tx.dailyAttendance.upsert({
          where: { userId_date: { userId: agentId, date } },
          create: { userId: agentId, orgId, date, status: "present" },
          update: {}
        });
        return newShift;
      });

      return toShift(shift);
    }),

  syncStart: perm(P.field.write)
    .input(
      z.object({
        clientShiftId: z.string().min(1),
        startedAt: z.string().datetime(),
        timezone: z.string().optional(),
        deviceId: z.string().optional(),
        appVersion: z.string().optional(),
        platform: z.enum(["android", "ios"]).optional(),
        orgId: z.string().optional()
      })
    )
    .output(syncShiftSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      const orgId =
        input.orgId ??
        ctx.actor.orgId ??
        (await inferOrgIdForShiftStart(ctx.prisma, agentId));
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      await assertFieldEnabled(ctx.prisma, agentId);
      const startedAt = parseClientDate(input.startedAt, "startedAt");

      const { shift: syncedShift, syncStatus } = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.shift.findUnique({
          where: {
            orgId_agentId_clientShiftId: {
              orgId,
              agentId,
              clientShiftId: input.clientShiftId
            }
          },
          select: SHIFT_SELECT
        });
        if (existing) {
          return { shift: existing, syncStatus: "existing" as const };
        }

        const active = await tx.shift.findFirst({
          where: { orgId, agentId, status: "active" },
          select: SHIFT_SELECT,
          orderBy: { startedAt: "desc" }
        });

        if (active?.clientShiftId && active.clientShiftId !== input.clientShiftId) {
          throw new TRPCError({ code: "CONFLICT", message: "ACTIVE_SHIFT_CONFLICT" });
        }

        if (active && !active.clientShiftId) {
          const shift = await tx.shift.update({
            where: { id: active.id },
            data: {
              clientShiftId: input.clientShiftId,
              clientStartedAt: startedAt,
              syncState: "client_synced"
            },
            select: SHIFT_SELECT
          });
          const date = startedAt.toISOString().slice(0, 10);
          await tx.dailyAttendance.upsert({
            where: { userId_date: { userId: agentId, date } },
            create: { userId: agentId, orgId, date, status: "present" },
            update: {}
          });
          return { shift, syncStatus: "reconciled" as const };
        }

        const shift = await tx.shift.create({
          data: {
            agentId,
            orgId,
            clientShiftId: input.clientShiftId,
            clientStartedAt: startedAt,
            startedAt,
            startType: "manual",
            status: "active",
            syncState: "client_synced"
          },
          select: SHIFT_SELECT
        });
        const date = startedAt.toISOString().slice(0, 10);
        await tx.dailyAttendance.upsert({
          where: { userId_date: { userId: agentId, date } },
          create: { userId: agentId, orgId, date, status: "present" },
          update: {}
        });
        return { shift, syncStatus: "created" as const };
      });

      return {
        shift: toShift(syncedShift),
        serverShiftId: syncedShift.id,
        clientShiftId: input.clientShiftId,
        status: syncStatus
      };
    }),

  end: perm(P.field.write)
    .input(z.object({}))
    .output(shiftSchema)
    .mutation(async ({ ctx }) => {
      const agentId = ctx.actor.id!;
      const orgId = ctx.actor.orgId;
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");
      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active", orgId }
      });
      if (!shift) throw apiError("NOT_FOUND", "No active shift");

      const updated = await ctx.prisma.shift.update({
        where: { id: shift.id },
        data: { endedAt: new Date(), endType: "manual", status: "completed" },
        select: SHIFT_SELECT
      });
      return toShift(updated);
    }),

  syncEnd: perm(P.field.write)
    .input(
      z.object({
        clientShiftId: z.string().min(1),
        endedAt: z.string().datetime(),
        deviceId: z.string().optional(),
        orgId: z.string().optional()
      })
    )
    .output(syncShiftSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      const orgId =
        input.orgId ??
        ctx.actor.orgId ??
        (await inferOrgIdForShiftStart(ctx.prisma, agentId));
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      const endedAt = parseClientDate(input.endedAt, "endedAt");
      const shift = await ctx.prisma.shift.findUnique({
        where: {
          orgId_agentId_clientShiftId: {
            orgId,
            agentId,
            clientShiftId: input.clientShiftId
          }
        },
        select: SHIFT_SELECT
      });
      if (!shift) throw apiError("NOT_FOUND", "SHIFT_NOT_SYNCED");
      if (endedAt.getTime() < shift.startedAt.getTime()) {
        throw apiError("BAD_REQUEST", "endedAt cannot be before startedAt");
      }
      if (shift.status === "completed") {
        return {
          shift: toShift(shift),
          serverShiftId: shift.id,
          clientShiftId: input.clientShiftId,
          status: "existing"
        };
      }

      const updated = await ctx.prisma.shift.update({
        where: { id: shift.id },
        data: {
          endedAt,
          clientEndedAt: endedAt,
          endType: "manual",
          status: "completed",
          syncState: "client_synced"
        },
        select: SHIFT_SELECT
      });
      return {
        shift: toShift(updated),
        serverShiftId: updated.id,
        clientShiftId: input.clientShiftId,
        status: "completed"
      };
    }),

  extend: perm(P.field.write)
    .input(z.object({}))
    .output(shiftSchema)
    .mutation(async ({ ctx }) => {
      const agentId = ctx.actor.id!;
      const orgId = ctx.actor.orgId;
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");
      const shift = await ctx.prisma.shift.findFirst({
        where: { agentId, status: "active", orgId }
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
        where: { agentId, status: "active", orgId: ctx.actor.orgId ?? undefined },
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
          orgId: resolveReadOrgId(ctx, input.orgId),
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
