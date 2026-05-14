import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";

const attendanceStatusSchema = z.enum(["present", "absent", "half_day", "leave"]);

const attendanceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  orgId: z.string(),
  date: z.string(),
  status: attendanceStatusSchema,
  markedBy: z.string().nullable(),
  note: z.string().nullable(),
  markedAt: z.string(),
  userName: z.string().nullable()
});

const ATTENDANCE_SELECT = {
  id: true,
  userId: true,
  orgId: true,
  date: true,
  status: true,
  markedBy: true,
  note: true,
  markedAt: true,
  user: { select: { name: true } }
} as const;

function toAttendance(row: {
  id: string;
  userId: string;
  orgId: string;
  date: string;
  status: "present" | "absent" | "half_day" | "leave";
  markedBy: string | null;
  note: string | null;
  markedAt: Date;
  user: { name: string };
}) {
  return {
    id: row.id,
    userId: row.userId,
    orgId: row.orgId,
    date: row.date,
    status: row.status,
    markedBy: row.markedBy,
    note: row.note,
    markedAt: row.markedAt.toISOString(),
    userName: row.user.name
  };
}

export const fieldAttendanceRouter = createTRPCRouter({
  mark: perm(P.field.write)
    .input(
      z.object({
        userId: z.string().uuid().optional(),
        orgId: z.string().optional(),
        date: z.string().optional(),
        status: attendanceStatusSchema,
        note: z.string().optional()
      })
    )
    .output(attendanceSchema)
    .mutation(async ({ ctx, input }) => {
      const callerId = ctx.actor.id!;
      const targetUserId = input.userId ?? callerId;
      const isOverride = targetUserId !== callerId;

      if (isOverride && !ctx.permissions.includes(SUPER_ADMIN_PERMISSION) && !ctx.permissions.includes(P.field.admin)) {
        throw apiError("FORBIDDEN", "Admin override requires field:admin");
      }

      const orgId = input.orgId ?? ctx.actor.orgId;
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      const date = input.date ?? new Date().toISOString().slice(0, 10);

      const row = await ctx.prisma.dailyAttendance.upsert({
        where: { userId_date: { userId: targetUserId, date } },
        create: {
          userId: targetUserId,
          orgId,
          date,
          status: input.status,
          markedBy: isOverride ? callerId : null,
          note: input.note ?? null
        },
        update: {
          status: input.status,
          markedBy: isOverride ? callerId : null,
          note: input.note ?? null,
          markedAt: new Date()
        },
        select: ATTENDANCE_SELECT
      });
      return toAttendance(row);
    }),

  list: perm(P.field.read)
    .input(
      z.object({
        userId: z.string().uuid().optional(),
        orgId: z.string().optional(),
        date: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        status: attendanceStatusSchema.optional(),
        limit: z.number().int().min(1).max(500).default(100)
      })
    )
    .output(z.array(attendanceSchema))
    .query(async ({ ctx, input }) => {
      const dateFilter: Record<string, unknown> = {};
      if (input.date) {
        dateFilter.date = input.date;
      } else {
        if (input.from) dateFilter.gte = input.from;
        if (input.to) dateFilter.lte = input.to;
        if (Object.keys(dateFilter).length > 0) {
          const d = dateFilter;
          return (
            await ctx.prisma.dailyAttendance.findMany({
              where: {
                userId: input.userId,
                orgId: input.orgId,
                status: input.status,
                date: d as { gte?: string; lte?: string }
              },
              select: ATTENDANCE_SELECT,
              orderBy: { date: "desc" },
              take: input.limit
            })
          ).map(toAttendance);
        }
      }

      const rows = await ctx.prisma.dailyAttendance.findMany({
        where: {
          userId: input.userId,
          orgId: input.orgId,
          date: input.date,
          status: input.status
        },
        select: ATTENDANCE_SELECT,
        orderBy: { date: "desc" },
        take: input.limit
      });
      return rows.map(toAttendance);
    }),

  patch: perm(P.field.write)
    .input(
      z.object({
        id: z.string().uuid(),
        status: attendanceStatusSchema.optional(),
        note: z.string().nullable().optional()
      })
    )
    .output(attendanceSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.permissions.includes(SUPER_ADMIN_PERMISSION) && !ctx.permissions.includes(P.field.admin)) {
        throw apiError("FORBIDDEN", "Patching attendance requires field:admin");
      }
      const existing = await ctx.prisma.dailyAttendance.findUnique({
        where: { id: input.id }
      });
      if (!existing) throw apiError("NOT_FOUND", "Attendance record not found");

      const row = await ctx.prisma.dailyAttendance.update({
        where: { id: input.id },
        data: {
          status: input.status,
          note: input.note,
          markedBy: ctx.actor.id!,
          markedAt: new Date()
        },
        select: ATTENDANCE_SELECT
      });
      return toAttendance(row);
    })
});
