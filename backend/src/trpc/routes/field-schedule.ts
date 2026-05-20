import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { resolveReadOrgId } from "./field-helpers";

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
  me: perm(P.field.read)
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

  upsertMe: perm(P.field.write)
    .input(scheduleInputSchema)
    .output(scheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.actor.id!;
      const orgId = resolveReadOrgId(ctx, input.orgId);
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

  list: perm(P.field.read)
    .input(
      z.object({
        orgId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100)
      })
    )
    .output(z.array(scheduleSchema))
    .query(async ({ ctx, input }) => {
      const orgId = resolveReadOrgId(ctx, input.orgId);
      const rows = await ctx.prisma.shiftSchedule.findMany({
        where: { orgId },
        select: SCHEDULE_SELECT,
        take: input.limit
      });
      return rows.map(toSchedule);
    }),

  setForUser: perm(P.field.write)
    .input(
      scheduleInputSchema.extend({
        userId: z.string().uuid()
      })
    )
    .output(scheduleSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.permissions.includes(SUPER_ADMIN_PERMISSION) && !ctx.permissions.includes(P.field.admin)) {
        throw apiError("FORBIDDEN", "Setting schedule for another user requires field:admin");
      }
      const orgId = resolveReadOrgId(ctx, input.orgId);
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
