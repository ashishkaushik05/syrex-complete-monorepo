import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { FINAL_STATUSES, assertOrgAccess, recordComplaintActivity, resolveTransition } from "./service-shared";

const assignmentOutputSchema = z.object({
  id: z.string(),
  complaintId: z.string(),
  asiUserId: z.string().nullable(),
  seUserId: z.string().nullable(),
  assignedById: z.string(),
  action: z.string(),
  note: z.string().nullable(),
  createdAt: z.date(),
});

const assignInputSchema = z
  .object({
    complaintId: z.string().uuid(),
    asiUserId: z.string().uuid().nullable().optional(),
    seUserId: z.string().uuid().nullable().optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((val) => val.asiUserId != null || val.seUserId != null, {
    message: "At least one of asiUserId or seUserId must be provided",
  });

export const serviceAssignmentsRouter = createTRPCRouter({
  assign: perm(P.service.assign)
    .input(assignInputSchema)
    .output(assignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;

      const complaint = await ctx.prisma.serviceComplaint.findUnique({
        where: { id: input.complaintId },
        select: { id: true, orgId: true, status: true },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
      assertOrgAccess(ctx.actor.orgId, complaint.orgId, "Complaint");

      if (input.asiUserId) {
        const asiUser = await ctx.prisma.user.findUnique({ where: { id: input.asiUserId }, select: { id: true, isActive: true } });
        if (!asiUser || !asiUser.isActive) throw apiError("NOT_FOUND", "ASI user not found or inactive");
      }
      if (input.seUserId) {
        const seUser = await ctx.prisma.user.findUnique({ where: { id: input.seUserId }, select: { id: true, isActive: true } });
        if (!seUser || !seUser.isActive) throw apiError("NOT_FOUND", "SE user not found or inactive");
      }

      const created = await ctx.prisma.$transaction(async (tx) => {
        const row = await tx.serviceAssignmentHistory.create({
          data: {
            complaintId: input.complaintId,
            asiUserId: input.asiUserId ?? null,
            seUserId: input.seUserId ?? null,
            assignedById: actorId,
            action: "assign",
            note: input.note ?? null,
          },
        });

        let nextStatus = complaint.status;
        if (complaint.status === "raised" && input.asiUserId) {
          const transition = resolveTransition(complaint.status, "assign");
          nextStatus = transition.nextStatus;
          await tx.serviceComplaint.update({
            where: { id: input.complaintId },
            data: { status: nextStatus },
          });
        }

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "assign",
          fromStatus: complaint.status,
          toStatus: nextStatus,
          note: input.note ?? null,
          meta: {
            asiUserId: input.asiUserId ?? null,
            seUserId: input.seUserId ?? null,
          },
        });

        return row;
      });

      return {
        id: created.id,
        complaintId: created.complaintId,
        asiUserId: created.asiUserId,
        seUserId: created.seUserId,
        assignedById: created.assignedById,
        action: created.action,
        note: created.note,
        createdAt: created.createdAt,
      };
    }),

  reassign: perm(P.service.assign)
    .input(assignInputSchema)
    .output(assignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;

      const complaint = await ctx.prisma.serviceComplaint.findUnique({
        where: { id: input.complaintId },
        select: { id: true, orgId: true, status: true },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
      assertOrgAccess(ctx.actor.orgId, complaint.orgId, "Complaint");

      if (FINAL_STATUSES.has(complaint.status)) {
        throw apiError("CONFLICT", `Cannot reassign a complaint with status '${complaint.status}'`);
      }

      if (input.asiUserId) {
        const asiUser = await ctx.prisma.user.findUnique({ where: { id: input.asiUserId }, select: { id: true, isActive: true } });
        if (!asiUser || !asiUser.isActive) throw apiError("NOT_FOUND", "ASI user not found or inactive");
      }
      if (input.seUserId) {
        const seUser = await ctx.prisma.user.findUnique({ where: { id: input.seUserId }, select: { id: true, isActive: true } });
        if (!seUser || !seUser.isActive) throw apiError("NOT_FOUND", "SE user not found or inactive");
      }

      const created = await ctx.prisma.$transaction(async (tx) => {
        const row = await tx.serviceAssignmentHistory.create({
          data: {
            complaintId: input.complaintId,
            asiUserId: input.asiUserId ?? null,
            seUserId: input.seUserId ?? null,
            assignedById: actorId,
            action: "reassign",
            note: input.note ?? null,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "reassign",
          fromStatus: complaint.status,
          toStatus: complaint.status,
          note: input.note ?? null,
          meta: {
            asiUserId: input.asiUserId ?? null,
            seUserId: input.seUserId ?? null,
          },
        });

        return row;
      });

      return {
        id: created.id,
        complaintId: created.complaintId,
        asiUserId: created.asiUserId,
        seUserId: created.seUserId,
        assignedById: created.assignedById,
        action: created.action,
        note: created.note,
        createdAt: created.createdAt,
      };
    }),
});
