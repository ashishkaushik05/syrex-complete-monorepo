import { z } from "zod";
import { createTRPCRouter, internalPerm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { FINAL_STATUSES, recordComplaintActivity } from "./service-shared";
import {
  resolveServiceActorRole,
  serviceComplaintAccessWhere,
} from "./service-access";

// Batch 04: refuse null actor orgId rather than silently widening filters.
function requireOrgId(actorOrgId: string | null): string {
  if (!actorOrgId) {
    throw apiError("FORBIDDEN", "Org context required");
  }
  return actorOrgId;
}

const ASI_ROLE_NAMES = new Set(["asi", "area service inspector"]);
const SE_ROLE_NAMES = new Set(["service engineer", "se"]);

function normalizeRoleName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function assertAssignableUser(
  user: { id: string; isActive: boolean; userType: string; role: { name: string } | null } | null,
  roleNames: Set<string>,
  label: string,
) {
  if (!user || !user.isActive || user.userType !== "internal") {
    throw apiError("NOT_FOUND", `${label} user not found or inactive`);
  }
  const roleName = normalizeRoleName(user.role?.name);
  if (!roleNames.has(roleName)) {
    throw apiError("BAD_REQUEST", `${label} user must have the ${label} role`);
  }
}

function isAsiRoleName(value: string | null | undefined) {
  return ASI_ROLE_NAMES.has(normalizeRoleName(value));
}

function isSeRoleName(value: string | null | undefined) {
  return SE_ROLE_NAMES.has(normalizeRoleName(value));
}

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

const assignmentInputSchema = z
  .object({
	    complaintId: z.string().uuid(),
	    asiUserId: z.string().uuid().nullable().optional(),
	    seUserId: z.string().uuid().nullable().optional(),
	    note: z.string().max(1000).nullable().optional(),
	  })
  .refine((val) => val.asiUserId != null || val.seUserId != null, {
    message: "At least one of asiUserId or seUserId must be provided",
  });

const initialAssignInputSchema = z.object({
  complaintId: z.string().uuid(),
  asiUserId: z.string().uuid(),
  note: z.string().max(1000).nullable().optional(),
});

const serviceStaffUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  roleName: z.string(),
});

const serviceAssignmentCandidatesSchema = z.object({
  asiUsers: z.array(serviceStaffUserSchema),
  serviceEngineers: z.array(serviceStaffUserSchema),
  actor: z.object({
    id: z.string().nullable(),
    roleName: z.string().nullable(),
    isAsi: z.boolean(),
  }),
});

function toStaffUser(user: { id: string; name: string; email: string; role: { name: string } | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleName: user.role?.name ?? "",
  };
}

export const serviceAssignmentsRouter = createTRPCRouter({
  candidates: internalPerm(P.service.assign)
    .input(z.void())
    .output(serviceAssignmentCandidatesSchema)
    .query(async ({ ctx }) => {
      const actorId = ctx.actor.id;
      const users = await ctx.prisma.user.findMany({
        where: {
          isActive: true,
          userType: "internal",
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { name: true } },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      });

      const actor = actorId ? users.find((user) => user.id === actorId) ?? null : null;

      return {
        asiUsers: users.filter((user) => isAsiRoleName(user.role?.name)).map(toStaffUser),
        serviceEngineers: users.filter((user) => isSeRoleName(user.role?.name)).map(toStaffUser),
        actor: {
          id: actorId ?? null,
          roleName: actor?.role?.name ?? null,
          isAsi: isAsiRoleName(actor?.role?.name),
        },
      };
    }),

  assign: internalPerm(P.service.assign)
    .input(initialAssignInputSchema)
    .output(assignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;
      const orgId = requireOrgId(ctx.actor.orgId);

      const complaint = await ctx.prisma.serviceComplaint.findFirst({
        where: { id: input.complaintId, orgId },
        select: {
          id: true,
          orgId: true,
          status: true,
          assignments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { asiUserId: true },
          },
        },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
      if (await resolveServiceActorRole(ctx) === "asi") {
        throw apiError("FORBIDDEN", "ASI users cannot assign ASI ownership");
      }
      if (FINAL_STATUSES.has(complaint.status)) {
        throw apiError("CONFLICT", `Cannot assign a complaint with status '${complaint.status}'`);
      }
      if (complaint.assignments[0]?.asiUserId) {
        throw apiError("CONFLICT", "Complaint already has an assigned ASI. Use reassignment.");
      }

      const asiUser = await ctx.prisma.user.findUnique({
        where: { id: input.asiUserId },
        select: {
          id: true,
          isActive: true,
          userType: true,
          managedByRsmId: true,
          role: { select: { name: true } },
        },
      });
      assertAssignableUser(asiUser, ASI_ROLE_NAMES, "ASI");

      const now = new Date();
      const created = await ctx.prisma.$transaction(async (tx) => {
        const row = await tx.serviceAssignmentHistory.create({
          data: {
            complaintId: input.complaintId,
            asiUserId: input.asiUserId,
            seUserId: null,
            assignedById: actorId,
            action: "assign",
            note: input.note ?? null,
          },
        });

        // Status advance requires ASI assignment (C02); set assignedAt on first assignment (H01)
        const nextStatus = complaint.status === "raised" ? "assigned" : complaint.status;
        await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: {
            status: nextStatus,
            assignedAt: complaint.status === "raised" ? now : undefined,
            // Denormalize the RSM link from the ASI's hierarchy for O(1) scoped queries.
            rsmUserId: asiUser?.managedByRsmId ?? undefined,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "assign",
          fromStatus: complaint.status,
          toStatus: nextStatus,
          note: input.note ?? null,
          meta: { asiUserId: input.asiUserId, seUserId: null },
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

  reassign: internalPerm(P.service.assign)
    .input(assignmentInputSchema)
    .output(assignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;
      const orgId = requireOrgId(ctx.actor.orgId);
      const actorRole = await resolveServiceActorRole(ctx);
      const accessWhere = await serviceComplaintAccessWhere(ctx, orgId);

      const complaint = await ctx.prisma.serviceComplaint.findFirst({
        where: { AND: [accessWhere, { id: input.complaintId }] },
        select: {
          id: true,
          orgId: true,
          status: true,
          assignments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { asiUserId: true, seUserId: true },
          },
        },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

      if (FINAL_STATUSES.has(complaint.status)) {
        throw apiError("CONFLICT", `Cannot reassign a complaint with status '${complaint.status}'`);
      }

      const latestAssignment = complaint.assignments[0] ?? null;
      if (!latestAssignment?.asiUserId) {
        throw apiError("CONFLICT", "Assign an ASI before assigning service engineers");
      }

      const actorIsAsi = actorRole === "asi";
      if (actorIsAsi) {
        if (input.asiUserId && input.asiUserId !== actorId) {
          throw apiError("FORBIDDEN", "ASI cannot transfer complaint ownership to another ASI");
        }
      }

      const nextAsiUserId = input.asiUserId ?? latestAssignment.asiUserId;
      const nextSeUserId = input.seUserId ?? latestAssignment.seUserId ?? null;

      if (input.asiUserId) {
        const asiUser = await ctx.prisma.user.findUnique({
          where: { id: input.asiUserId },
          select: { id: true, isActive: true, userType: true, role: { select: { name: true } } },
        });
        assertAssignableUser(asiUser, ASI_ROLE_NAMES, "ASI");
      }
      if (input.seUserId) {
        const seUser = await ctx.prisma.user.findUnique({
          where: { id: input.seUserId },
          select: { id: true, isActive: true, userType: true, role: { select: { name: true } } },
        });
        assertAssignableUser(seUser, SE_ROLE_NAMES, "Service Engineer");
      }

      const created = await ctx.prisma.$transaction(async (tx) => {
        const row = await tx.serviceAssignmentHistory.create({
          data: {
            complaintId: input.complaintId,
            asiUserId: nextAsiUserId,
            seUserId: nextSeUserId,
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
            asiUserId: nextAsiUserId,
            seUserId: nextSeUserId,
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
