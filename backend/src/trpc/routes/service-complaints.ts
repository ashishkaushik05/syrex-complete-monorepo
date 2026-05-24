import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import {
  SERVICE_STATUS_VALUES,
  SERVICE_TRANSITION_ACTIONS,
  assertOrgAccess,
  ensureSerialIndex,
  nextComplaintNumber,
  normalizeSerial,
  recordComplaintActivity,
  resolveTransition,
} from "./service-shared";

const complaintStatusSchema = z.enum(SERVICE_STATUS_VALUES);
const transitionActionSchema = z.enum(SERVICE_TRANSITION_ACTIONS);

const complaintLineInputSchema = z.object({
  serialNumber: z.string().min(2),
  productId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

const complaintLineSchema = z.object({
  id: z.string(),
  serialNumber: z.string(),
  normalizedSerial: z.string(),
  replacementSerialNumber: z.string().nullable(),
  normalizedReplacementSerial: z.string().nullable(),
  productId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const complaintListItemSchema = z.object({
  id: z.string(),
  complaintNumber: z.string(),
  status: complaintStatusSchema,
  title: z.string().nullable(),
  outletId: z.string().nullable(),
  outletName: z.string().nullable(),
  raisedById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  serials: z.array(z.string()),
});

const complaintDetailSchema = complaintListItemSchema.extend({
  description: z.string().nullable(),
  telephonicReason: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  closedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  lines: z.array(complaintLineSchema),
  assignments: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      note: z.string().nullable(),
      asiUserId: z.string().nullable(),
      seUserId: z.string().nullable(),
      assignedById: z.string(),
      createdAt: z.string(),
    }),
  ),
  tests: z.array(
    z.object({
      id: z.string(),
      complaintLineId: z.string().nullable(),
      submittedById: z.string(),
      verdict: z.string(),
      summary: z.string().nullable(),
      structuredData: z.unknown().nullable(),
      createdAt: z.string(),
    }),
  ),
  activities: z.array(
    z.object({
      id: z.string(),
      actorId: z.string().nullable(),
      action: z.string(),
      fromStatus: complaintStatusSchema.nullable(),
      toStatus: complaintStatusSchema.nullable(),
      note: z.string().nullable(),
      meta: z.unknown().nullable(),
      createdAt: z.string(),
    }),
  ),
  warrantyDecision: z
    .object({
      id: z.string(),
      status: z.enum(["pending", "approved", "rejected"]),
      decidedById: z.string().nullable(),
      sourceWarehouseId: z.string().nullable(),
      approvedReplacementSerial: z.string().nullable(),
      rejectionReason: z.string().nullable(),
      replacementOrderId: z.string().nullable(),
      decidedAt: z.string().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
});

function toComplaintListItem(row: {
  id: string;
  complaintNumber: string;
  status: (typeof SERVICE_STATUS_VALUES)[number];
  title: string | null;
  outletId: string | null;
  raisedById: string;
  createdAt: Date;
  updatedAt: Date;
  outlet: { name: string } | null;
  lines: Array<{ serialNumber: string }>;
}) {
  return {
    id: row.id,
    complaintNumber: row.complaintNumber,
    status: row.status,
    title: row.title,
    outletId: row.outletId,
    outletName: row.outlet?.name ?? null,
    raisedById: row.raisedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    serials: row.lines.map((line) => line.serialNumber),
  };
}

export const serviceComplaintsRouter = createTRPCRouter({
  list: perm(P.service.read)
    .input(
      paginationInputSchema.extend({
        status: complaintStatusSchema.optional(),
        q: z.string().min(1).optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(complaintListItemSchema),
        nextCursor: z.string().nullable(),
        tabCounts: z.object({
          all: z.number().int(),
          raised: z.number().int(),
          assigned: z.number().int(),
          visit: z.number().int(),
          test_result_submitted: z.number().int(),
          retest_requested: z.number().int(),
          resolved: z.number().int(),
          telephonic_closure: z.number().int(),
          cancelled: z.number().int(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;

      const baseFilter = {
        orgId: ctx.actor.orgId ?? undefined,
        OR: input.q
          ? [
              { complaintNumber: { contains: input.q, mode: "insensitive" as const } },
              { title: { contains: input.q, mode: "insensitive" as const } },
              { description: { contains: input.q, mode: "insensitive" as const } },
              {
                lines: {
                  some: {
                    OR: [
                      { serialNumber: { contains: input.q, mode: "insensitive" as const } },
                      { replacementSerialNumber: { contains: input.q, mode: "insensitive" as const } },
                    ],
                  },
                },
              },
            ]
          : undefined,
      };

      const where = {
        ...baseFilter,
        status: input.status,
      };

      const [rows, allCounts, total] = await Promise.all([
        ctx.prisma.serviceComplaint.findMany({
          where,
          include: {
            outlet: {
              select: { name: true },
            },
            lines: {
              select: { serialNumber: true },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: offset,
          take: input.limit + 1,
        }),
        ctx.prisma.serviceComplaint.groupBy({
          by: ["status"],
          where: baseFilter,
          _count: { _all: true },
        }),
        ctx.prisma.serviceComplaint.count({ where: baseFilter }),
      ]);

      const hasMore = rows.length > input.limit;
      const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

      const tabCounts = {
        all: total,
        raised: 0,
        assigned: 0,
        visit: 0,
        test_result_submitted: 0,
        retest_requested: 0,
        resolved: 0,
        telephonic_closure: 0,
        cancelled: 0,
      };
      for (const bucket of allCounts) {
        tabCounts[bucket.status] = bucket._count._all;
      }

      return {
        items: pageRows.map(toComplaintListItem),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null,
        tabCounts,
      };
    }),

  get: perm(P.service.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(complaintListItemSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.prisma.serviceComplaint.findUnique({
        where: { id: input.id },
        include: {
          outlet: { select: { name: true } },
          lines: { select: { serialNumber: true } },
        },
      });
      if (!row) throw apiError("NOT_FOUND", "Complaint not found");
      assertOrgAccess(ctx.actor.orgId, row.orgId, "Complaint");
      return toComplaintListItem(row);
    }),

  detail: perm(P.service.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(complaintDetailSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.prisma.serviceComplaint.findUnique({
        where: { id: input.id },
        include: {
          outlet: { select: { name: true } },
          lines: true,
          assignments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
          testReports: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
          activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
          warrantyDecision: true,
        },
      });
      if (!row) throw apiError("NOT_FOUND", "Complaint not found");
      assertOrgAccess(ctx.actor.orgId, row.orgId, "Complaint");

      return {
        ...toComplaintListItem(row),
        description: row.description,
        telephonicReason: row.telephonicReason,
        resolutionNote: row.resolutionNote,
        closedAt: row.closedAt?.toISOString() ?? null,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        lines: row.lines.map((line) => ({
          id: line.id,
          serialNumber: line.serialNumber,
          normalizedSerial: line.normalizedSerial,
          replacementSerialNumber: line.replacementSerialNumber,
          normalizedReplacementSerial: line.normalizedReplacementSerial,
          productId: line.productId,
          notes: line.notes,
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
        })),
        assignments: row.assignments.map((assignment) => ({
          id: assignment.id,
          action: assignment.action,
          note: assignment.note,
          asiUserId: assignment.asiUserId,
          seUserId: assignment.seUserId,
          assignedById: assignment.assignedById,
          createdAt: assignment.createdAt.toISOString(),
        })),
        tests: row.testReports.map((test) => ({
          id: test.id,
          complaintLineId: test.complaintLineId,
          submittedById: test.submittedById,
          verdict: test.verdict,
          summary: test.summary,
          structuredData: test.structuredData ?? null,
          createdAt: test.createdAt.toISOString(),
        })),
        activities: row.activities.map((activity) => ({
          id: activity.id,
          actorId: activity.actorId,
          action: activity.action,
          fromStatus: activity.fromStatus,
          toStatus: activity.toStatus,
          note: activity.note,
          meta: activity.meta ?? null,
          createdAt: activity.createdAt.toISOString(),
        })),
        warrantyDecision: row.warrantyDecision
          ? {
              id: row.warrantyDecision.id,
              status: row.warrantyDecision.status,
              decidedById: row.warrantyDecision.decidedById,
              sourceWarehouseId: row.warrantyDecision.sourceWarehouseId,
              approvedReplacementSerial: row.warrantyDecision.approvedReplacementSerial,
              rejectionReason: row.warrantyDecision.rejectionReason,
              replacementOrderId: row.warrantyDecision.replacementOrderId,
              decidedAt: row.warrantyDecision.decidedAt?.toISOString() ?? null,
              updatedAt: row.warrantyDecision.updatedAt.toISOString(),
            }
          : null,
      };
    }),

  create: perm(P.service.write)
    .input(
      z.object({
        title: z.string().max(200).optional(),
        description: z.string().max(4000).optional(),
        outletId: z.string().uuid().optional(),
        lines: z.array(complaintLineInputSchema).min(1).max(50),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;

      const actor = await ctx.prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, userType: true },
      });
      if (!actor || actor.userType !== "internal") {
        throw apiError("FORBIDDEN", "Complaint creation is restricted to internal users");
      }

      const orgId = ctx.actor.orgId ?? null;
      const now = new Date();
      const createdId = await ctx.prisma.$transaction(async (tx) => {
        const complaintNumber = await nextComplaintNumber(tx, now, orgId ?? "");

        const created = await tx.serviceComplaint.create({
          data: {
            complaintNumber,
            orgId,
            status: "raised",
            title: input.title ?? null,
            description: input.description ?? null,
            outletId: input.outletId ?? null,
            raisedById: actorId,
            lines: {
              create: input.lines.map((line) => ({
                serialNumber: line.serialNumber,
                normalizedSerial: normalizeSerial(line.serialNumber),
                productId: line.productId,
                notes: line.notes,
              })),
            },
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: created.id,
          actorId,
          action: "raised",
          fromStatus: null,
          toStatus: "raised",
          note: input.description ?? null,
        });

        return created.id;
      });

      const lines = await ctx.prisma.serviceComplaintLine.findMany({
        where: { complaintId: createdId },
      });
      await Promise.all(lines.map((line) => ensureSerialIndex(ctx, line.serialNumber)));

      return await ctx.prisma.serviceComplaint
        .findUniqueOrThrow({
          where: { id: createdId },
          include: {
            outlet: { select: { name: true } },
            lines: true,
            assignments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
            testReports: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
            activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
            warrantyDecision: true,
          },
        })
        .then((row) => ({
          ...toComplaintListItem(row),
          description: row.description,
          telephonicReason: row.telephonicReason,
          resolutionNote: row.resolutionNote,
          closedAt: row.closedAt?.toISOString() ?? null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          lines: row.lines.map((line) => ({
            id: line.id,
            serialNumber: line.serialNumber,
            normalizedSerial: line.normalizedSerial,
            replacementSerialNumber: line.replacementSerialNumber,
            normalizedReplacementSerial: line.normalizedReplacementSerial,
            productId: line.productId,
            notes: line.notes,
            createdAt: line.createdAt.toISOString(),
            updatedAt: line.updatedAt.toISOString(),
          })),
          assignments: row.assignments.map((assignment) => ({
            id: assignment.id,
            action: assignment.action,
            note: assignment.note,
            asiUserId: assignment.asiUserId,
            seUserId: assignment.seUserId,
            assignedById: assignment.assignedById,
            createdAt: assignment.createdAt.toISOString(),
          })),
          tests: row.testReports.map((test) => ({
            id: test.id,
            complaintLineId: test.complaintLineId,
            submittedById: test.submittedById,
            verdict: test.verdict,
            summary: test.summary,
            structuredData: test.structuredData ?? null,
            createdAt: test.createdAt.toISOString(),
          })),
          activities: row.activities.map((activity) => ({
            id: activity.id,
            actorId: activity.actorId,
            action: activity.action,
            fromStatus: activity.fromStatus,
            toStatus: activity.toStatus,
            note: activity.note,
            meta: activity.meta ?? null,
            createdAt: activity.createdAt.toISOString(),
          })),
          warrantyDecision: row.warrantyDecision
            ? {
                id: row.warrantyDecision.id,
                status: row.warrantyDecision.status,
                decidedById: row.warrantyDecision.decidedById,
                sourceWarehouseId: row.warrantyDecision.sourceWarehouseId,
                approvedReplacementSerial: row.warrantyDecision.approvedReplacementSerial,
                rejectionReason: row.warrantyDecision.rejectionReason,
                replacementOrderId: row.warrantyDecision.replacementOrderId,
                decidedAt: row.warrantyDecision.decidedAt?.toISOString() ?? null,
                updatedAt: row.warrantyDecision.updatedAt.toISOString(),
              }
            : null,
        }));
    }),

  update: perm(P.service.write)
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(200).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        resolutionNote: z.string().max(2000).nullable().optional(),
      }),
    )
    .output(complaintListItemSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      const row = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceComplaint.findUnique({
          where: { id: input.id },
          select: { orgId: true, status: true, title: true, description: true, resolutionNote: true },
        });
        if (!existing) throw apiError("NOT_FOUND", "Complaint not found");
        assertOrgAccess(ctx.actor.orgId, existing.orgId, "Complaint");

        const FINAL_STATUSES = new Set(["resolved", "telephonic_closure", "cancelled"]);
        if (FINAL_STATUSES.has(existing.status)) {
          throw apiError("CONFLICT", "Cannot update a closed complaint");
        }

        const updated = await tx.serviceComplaint.update({
          where: { id: input.id },
          data: {
            title: input.title,
            description: input.description,
            resolutionNote: input.resolutionNote,
          },
          include: {
            outlet: { select: { name: true } },
            lines: { select: { serialNumber: true } },
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: "updated",
          note: "Complaint fields updated",
          meta: {
            old: {
              title: existing.title,
              description: existing.description,
              resolutionNote: existing.resolutionNote,
            },
            new: {
              title: input.title,
              description: input.description,
              resolutionNote: input.resolutionNote,
            },
          },
        });

        return updated;
      });

      return toComplaintListItem(row);
    }),

  transition: perm(P.service.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        action: transitionActionSchema,
        note: z.string().max(2000).nullable().optional(),
      }),
    )
    .output(complaintListItemSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.action === "assign" && !ctx.permissions.includes(P.service.assign)) {
        throw apiError("FORBIDDEN", "Requires service:assign permission");
      }
      if (input.action === "retest_requested" && !ctx.permissions.includes(P.service.retest)) {
        throw apiError("FORBIDDEN", "Requires: service:retest");
      }
      if (input.action === "telephonic_close" && !ctx.permissions.includes(P.service.telephonic)) {
        throw apiError("FORBIDDEN", "Requires: service:telephonic");
      }
      if (input.action === "cancel" && !ctx.permissions.includes(P.service.cancel)) {
        throw apiError("FORBIDDEN", "Requires: service:cancel");
      }
      if (
        (input.action === "warranty_approve" || input.action === "warranty_reject") &&
        !ctx.permissions.includes(P.service.approve)
      ) {
        throw apiError("FORBIDDEN", "Requires: service:approve");
      }

      const actorId = ctx.actor.id;

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findUnique({
          where: { id: input.id },
          include: {
            outlet: { select: { name: true } },
            lines: { select: { serialNumber: true } },
          },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
        assertOrgAccess(ctx.actor.orgId, complaint.orgId, "Complaint");

        const transition = resolveTransition(complaint.status, input.action);

        const nextPatch: {
          status?: (typeof SERVICE_STATUS_VALUES)[number];
          telephonicReason?: string | null;
          resolutionNote?: string | null;
          closedAt?: Date | null;
          cancelledAt?: Date | null;
        } = {};

        if (transition.statusChanged) {
          nextPatch.status = transition.nextStatus;
        }
        if (input.action === "telephonic_close") {
          if (!input.note?.trim()) {
            throw apiError("BAD_REQUEST", "Telephonic closure reason is required");
          }
          nextPatch.telephonicReason = input.note;
          nextPatch.closedAt = new Date();
        }
        if (input.action === "tested_ok_close" || input.action === "warranty_reject") {
          nextPatch.resolutionNote = input.note ?? "Closed after service decision";
          nextPatch.closedAt = new Date();
        }
        if (input.action === "cancel") {
          nextPatch.cancelledAt = new Date();
        }

        const row = await tx.serviceComplaint.update({
          where: { id: input.id },
          data: {
            ...nextPatch,
          },
          include: {
            outlet: { select: { name: true } },
            lines: { select: { serialNumber: true } },
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: input.action,
          fromStatus: complaint.status,
          toStatus: transition.nextStatus,
          note: input.note,
        });

        return row;
      });

      return toComplaintListItem(updated);
    }),

});
