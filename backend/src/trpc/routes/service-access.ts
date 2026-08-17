import { Prisma } from "@prisma/client";
import type { TrpcContext } from "../context";
import { apiError } from "../error";

export type ServiceActorRole = "asi" | "service_engineer" | "rsm" | "back_office";

const ASI_ROLE_NAMES = new Set(["asi", "area service inspector"]);
const SE_ROLE_NAMES = new Set(["service engineer", "se"]);
const RSM_ROLE_NAMES = new Set(["rsm", "regional service manager"]);

function normalizeRoleName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function resolveServiceActorRole(
  ctx: Pick<TrpcContext, "actor" | "prisma" | "userType">,
): Promise<ServiceActorRole> {
  const actorId = ctx.actor.id;
  if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");
  if (ctx.userType !== "internal") {
    throw apiError("FORBIDDEN", "Internal staff access is required");
  }
  const user = await ctx.prisma.user.findUnique({
    where: { id: actorId },
    select: { role: { select: { name: true } } },
  });
  if (!user) throw apiError("UNAUTHORIZED", "User not found");

  const roleName = normalizeRoleName(user.role?.name);
  if (ASI_ROLE_NAMES.has(roleName)) return "asi";
  if (SE_ROLE_NAMES.has(roleName)) return "service_engineer";
  if (RSM_ROLE_NAMES.has(roleName)) return "rsm";
  return "back_office";
}

export async function serviceComplaintAccessWhere(
  ctx: Pick<TrpcContext, "actor" | "prisma" | "userType">,
  orgId: string,
): Promise<Prisma.ServiceComplaintWhereInput> {
  const role = await resolveServiceActorRole(ctx);
  if (role === "back_office") return { orgId };
  if (role === "rsm") return { orgId, rsmUserId: ctx.actor.id! };

  const latestAssignments = await ctx.prisma.serviceAssignmentHistory.findMany({
    where: { complaint: { orgId } },
    select: { complaintId: true, asiUserId: true, seUserId: true },
    distinct: ["complaintId"],
    orderBy: [{ complaintId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const actorId = ctx.actor.id!;
  const complaintIds = latestAssignments
    .filter((assignment) =>
      role === "asi"
        ? assignment.asiUserId === actorId
        : assignment.seUserId === actorId,
    )
    .map((assignment) => assignment.complaintId);
  return { orgId, id: { in: complaintIds } };
}

export async function assertServiceComplaintAccess(
  ctx: Pick<TrpcContext, "actor" | "prisma" | "userType">,
  complaintId: string,
  orgId: string,
) {
  const accessWhere = await serviceComplaintAccessWhere(ctx, orgId);
  const complaint = await ctx.prisma.serviceComplaint.findFirst({
    where: { AND: [accessWhere, { id: complaintId }] },
    select: { id: true },
  });
  if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
}

export function isServiceEntityType(
  entityType: string,
): entityType is
  | "service_complaint"
  | "service_test"
  | "service_form_submission"
  | "warranty_decision" {
  return (
    entityType === "service_complaint" ||
    entityType === "service_test" ||
    entityType === "service_form_submission" ||
    entityType === "warranty_decision"
  );
}

export async function complaintIdForServiceEntity(
  ctx: Pick<TrpcContext, "prisma">,
  entityType:
    | "service_complaint"
    | "service_test"
    | "service_form_submission"
    | "warranty_decision",
  entityId: string,
) {
  if (entityType === "service_complaint") return entityId;
  if (entityType === "service_test") {
    const row = await ctx.prisma.serviceTestReport.findUnique({
      where: { id: entityId },
      select: { complaintId: true },
    });
    return row?.complaintId ?? null;
  }
  if (entityType === "warranty_decision") {
    const row = await ctx.prisma.serviceWarrantyDecision.findUnique({
      where: { id: entityId },
      select: { complaintId: true },
    });
    return row?.complaintId ?? null;
  }
  const row = await ctx.prisma.serviceFormSubmission.findUnique({
    where: { id: entityId },
    select: { complaintId: true },
  });
  return row?.complaintId ?? null;
}
