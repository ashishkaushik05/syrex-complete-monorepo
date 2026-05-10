import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";

const scheduleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  orgId: z.string(),
  autoStartTime: z.string(),
  timezone: z.string(),
  isEnabled: z.boolean(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string()
});

const SCHEDULE_SELECT = {
  id: true,
  userId: true,
  orgId: true,
  autoStartTime: true,
  timezone: true,
  isEnabled: true,
  updatedBy: true,
  updatedAt: true
} as const;

function toSchedule(s: {
  id: string;
  userId: string;
  orgId: string;
  autoStartTime: string;
  timezone: string;
  isEnabled: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}) {
  return { ...s, updatedAt: s.updatedAt.toISOString() };
}

const scheduleInputSchema = z.object({
  orgId: z.string().optional(),
  autoStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  timezone: z.string().default("Asia/Kolkata"),
  isEnabled: z.boolean().default(true)
});

export const fieldScheduleRouter = createTRPCRouter({
  me: perm("field:read")
    .input(z.object({}))
    .output(scheduleSchema.nullable())
    .query(async ({ ctx }) => {
      const userId = ctx.actor.id!;
      const row = await ctx.prisma.shiftSchedule.findUnique({
        where: { userId },
        select: SCHEDULE_SELECT
      });
      return row ? toSchedule(row) : null;
    }),

  upsertMe: perm("field:write")
    .input(scheduleInputSchema)
    .output(scheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.actor.id!;
      const orgId = input.orgId ?? ctx.actor.orgId;
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      const row = await ctx.prisma.shiftSchedule.upsert({
        where: { userId },
        create: {
          userId,
          orgId,
          autoStartTime: input.autoStartTime,
          timezone: input.timezone,
          isEnabled: input.isEnabled
        },
        update: {
          autoStartTime: input.autoStartTime,
          timezone: input.timezone,
          isEnabled: input.isEnabled,
          updatedBy: userId
        },
        select: SCHEDULE_SELECT
      });
      return toSchedule(row);
    }),

  list: perm("field:read")
    .input(
      z.object({
        orgId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100)
      })
    )
    .output(z.array(scheduleSchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.shiftSchedule.findMany({
        where: { orgId: input.orgId },
        select: SCHEDULE_SELECT,
        take: input.limit
      });
      return rows.map(toSchedule);
    }),

  setForUser: perm("field:write")
    .input(
      scheduleInputSchema.extend({
        userId: z.string().uuid()
      })
    )
    .output(scheduleSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.permissions.includes("*") && !ctx.permissions.includes("users:write")) {
        throw apiError("FORBIDDEN", "Setting schedule for another user requires users:write");
      }
      const orgId = input.orgId ?? ctx.actor.orgId;
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, userType: true }
      });
      if (!target) throw apiError("NOT_FOUND", "User not found");
      if (target.userType !== "internal") {
        throw apiError("BAD_REQUEST", "Schedules can only be set for internal users");
      }

      const row = await ctx.prisma.shiftSchedule.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          orgId,
          autoStartTime: input.autoStartTime,
          timezone: input.timezone,
          isEnabled: input.isEnabled,
          updatedBy: ctx.actor.id!
        },
        update: {
          autoStartTime: input.autoStartTime,
          timezone: input.timezone,
          isEnabled: input.isEnabled,
          updatedBy: ctx.actor.id!
        },
        select: SCHEDULE_SELECT
      });
      return toSchedule(row);
    })
});
