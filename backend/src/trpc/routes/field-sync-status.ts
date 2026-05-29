import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertFieldEnabled, resolveReadOrgId } from "./field-helpers";

const syncStatusSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  agentId: z.string(),
  deviceId: z.string(),
  shiftId: z.string().nullable(),
  clientShiftId: z.string().nullable(),
  appVersion: z.string().nullable(),
  platform: z.string().nullable(),
  lastCapturedAt: z.string().nullable(),
  lastReceivedAt: z.string().nullable(),
  lastSyncAttemptAt: z.string().nullable(),
  lastSyncErrorCode: z.string().nullable(),
  pendingQueueDepth: z.number().nullable(),
  permissionsSummary: z.unknown().nullable(),
  updatedAt: z.string()
});

const SYNC_STATUS_SELECT = {
  id: true,
  orgId: true,
  agentId: true,
  deviceId: true,
  shiftId: true,
  clientShiftId: true,
  appVersion: true,
  platform: true,
  lastCapturedAt: true,
  lastReceivedAt: true,
  lastSyncAttemptAt: true,
  lastSyncErrorCode: true,
  pendingQueueDepth: true,
  permissionsSummary: true,
  updatedAt: true
} as const;

function toSyncStatus(row: {
  id: string;
  orgId: string;
  agentId: string;
  deviceId: string;
  shiftId: string | null;
  clientShiftId: string | null;
  appVersion: string | null;
  platform: string | null;
  lastCapturedAt: Date | null;
  lastReceivedAt: Date | null;
  lastSyncAttemptAt: Date | null;
  lastSyncErrorCode: string | null;
  pendingQueueDepth: number | null;
  permissionsSummary: Prisma.JsonValue | null;
  updatedAt: Date;
}) {
  return {
    ...row,
    lastCapturedAt: row.lastCapturedAt?.toISOString() ?? null,
    lastReceivedAt: row.lastReceivedAt?.toISOString() ?? null,
    lastSyncAttemptAt: row.lastSyncAttemptAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}

function parseOptionalDate(value: string | undefined, fieldName: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw apiError("BAD_REQUEST", `${fieldName} must be a valid ISO datetime`);
  }
  return date;
}

export const fieldSyncStatusRouter = createTRPCRouter({
  upsert: perm(P.field.write)
    .input(
      z.object({
        deviceId: z.string().min(1),
        shiftId: z.string().uuid().optional(),
        clientShiftId: z.string().optional(),
        appVersion: z.string().optional(),
        platform: z.string().optional(),
        lastCapturedAt: z.string().optional(),
        lastSyncAttemptAt: z.string().optional(),
        lastSyncErrorCode: z.string().nullable().optional(),
        pendingQueueDepth: z.number().int().min(0).optional(),
        permissionsSummary: z.unknown().optional(),
        orgId: z.string().optional()
      })
    )
    .output(syncStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const agentId = ctx.actor.id!;
      await assertFieldEnabled(ctx.prisma, agentId);
      let orgId = input.orgId ?? ctx.actor.orgId;
      if (!orgId && (input.shiftId || input.clientShiftId)) {
        const shift = await ctx.prisma.shift.findFirst({
          where: {
            agentId,
            id: input.shiftId,
            clientShiftId: input.clientShiftId
          },
          select: { orgId: true }
        });
        orgId = shift?.orgId ?? null;
      }
      if (!orgId) throw apiError("BAD_REQUEST", "orgId required");

      if (input.shiftId) {
        const shift = await ctx.prisma.shift.findFirst({
          where: { id: input.shiftId, orgId, agentId },
          select: { id: true }
        });
        if (!shift) throw apiError("FORBIDDEN", "Shift does not belong to actor org");
      }

      const row = await ctx.prisma.fieldSyncStatus.upsert({
        where: {
          orgId_agentId_deviceId: {
            orgId,
            agentId,
            deviceId: input.deviceId
          }
        },
        create: {
          orgId,
          agentId,
          deviceId: input.deviceId,
          shiftId: input.shiftId ?? null,
          clientShiftId: input.clientShiftId ?? null,
          appVersion: input.appVersion ?? null,
          platform: input.platform ?? null,
          lastCapturedAt: parseOptionalDate(input.lastCapturedAt, "lastCapturedAt"),
          lastSyncAttemptAt: parseOptionalDate(
            input.lastSyncAttemptAt,
            "lastSyncAttemptAt"
          ),
          lastSyncErrorCode: input.lastSyncErrorCode ?? null,
          pendingQueueDepth: input.pendingQueueDepth ?? null,
          permissionsSummary:
            (input.permissionsSummary as Prisma.InputJsonValue | undefined) ??
            undefined
        },
        update: {
          shiftId: input.shiftId,
          clientShiftId: input.clientShiftId,
          appVersion: input.appVersion,
          platform: input.platform,
          lastCapturedAt: parseOptionalDate(input.lastCapturedAt, "lastCapturedAt"),
          lastSyncAttemptAt: parseOptionalDate(
            input.lastSyncAttemptAt,
            "lastSyncAttemptAt"
          ),
          lastSyncErrorCode: input.lastSyncErrorCode,
          pendingQueueDepth: input.pendingQueueDepth,
          permissionsSummary:
            (input.permissionsSummary as Prisma.InputJsonValue | undefined) ??
            undefined
        },
        select: SYNC_STATUS_SELECT
      });
      return toSyncStatus(row);
    }),

  list: perm(P.field.read)
    .input(
      z.object({
        agentId: z.string().uuid().optional(),
        orgId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100)
      })
    )
    .output(z.array(syncStatusSchema))
    .query(async ({ ctx, input }) => {
      const orgId = resolveReadOrgId(ctx, input.orgId);
      const rows = await ctx.prisma.fieldSyncStatus.findMany({
        where: {
          orgId,
          agentId: input.agentId
        },
        select: SYNC_STATUS_SELECT,
        orderBy: { updatedAt: "desc" },
        take: input.limit
      });
      return rows.map(toSyncStatus);
    })
});
