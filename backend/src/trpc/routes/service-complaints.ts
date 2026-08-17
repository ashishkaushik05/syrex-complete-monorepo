import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, internalPerm, internalPermAny } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import {
  FINAL_STATUSES,
  SERVICE_STATUS_VALUES,
  SERVICE_TRANSITION_ACTIONS,
  createServiceComplaint,
  recordComplaintActivity,
  resolveTransition,
  serviceComplaintCreateFieldsSchema,
} from "./service-shared";
import {
  assertServiceComplaintAccess,
  resolveServiceActorRole,
  serviceComplaintAccessWhere,
} from "./service-access";

// Batch 04: enforce org context on every service procedure. Null actor orgId is
// treated as a configuration error and refused — never silently widened to all orgs.
function requireOrgId(actorOrgId: string | null): string {
  if (!actorOrgId) {
    throw apiError("FORBIDDEN", "Org context required");
  }
  return actorOrgId;
}

const complaintStatusSchema = z.enum(SERVICE_STATUS_VALUES);
const transitionActionSchema = z.enum(SERVICE_TRANSITION_ACTIONS);
const resolutionReasonSchema = z.enum([
  "tested_ok",
  "warranty_approved",
  "warranty_rejected",
  "telephonic_closure",
  "cancelled",
]);
const happyCallingStatusSchema = z.enum(["pending", "completed", "skipped"]);

const complaintLineSchema = z.object({
  id: z.string(),
  sku: z.string(),
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
  issueCategory: z.string(),
  title: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerState: z.string().nullable(),
  customerCity: z.string().nullable(),
  alternatePhone: z.string().nullable(),
  resolutionReason: resolutionReasonSchema.nullable(),
  happyCallingStatus: happyCallingStatusSchema.nullable(),
  raisedByUserId: z.string().nullable(),
  raisedByServiceUserId: z.string().nullable(),
  rsmUserId: z.string().nullable(),
  assignedAsiName: z.string().nullable(),
  assignedSeName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  serials: z.array(z.string()),
});

const complaintDetailSchema = complaintListItemSchema.extend({
  description: z.string().nullable(),
  complainantType: z.enum(["self", "on_behalf_of"]),
  thirdPartyName: z.string().nullable(),
  thirdPartyPhone: z.string().nullable(),
  customerPincode: z.string().nullable(),
  customerAddress: z.string().nullable(),
  rsmUserName: z.string().nullable(),
  happyCallingNote: z.string().nullable(),
  physicalReturnAt: z.string().nullable(),
  physicalReturnNote: z.string().nullable(),
  causeOfFailure: z.string().nullable(),
  telephonicReason: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  closedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  lines: z.array(complaintLineSchema),
  assignments: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      note: z.string().nullable(),
      asiUserId: z.string().nullable(),
      seUserId: z.string().nullable(),
      asiUserName: z.string().nullable(),
      seUserName: z.string().nullable(),
      assignedById: z.string(),
      createdAt: z.string(),
    }),
  ),
  tests: z.array(
    z.object({
      id: z.string(),
      complaintLineId: z.string().nullable(),
      submittedById: z.string(),
      submittedByName: z.string().nullable(),
      verdict: z.string(),
      summary: z.string().nullable(),
      causeOfFailure: z.string().nullable(),
      structuredData: z.unknown().nullable(),
      createdAt: z.string(),
    }),
  ),
  activities: z.array(
    z.object({
      id: z.string(),
      actorId: z.string().nullable(),
      actorName: z.string().nullable(),
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
      fulfillmentRoute: z.enum(["warehouse", "outlet"]).nullable(),
      sourceWarehouseId: z.string().nullable(),
      sourceOutletId: z.string().nullable(),
      claimingOutletId: z.string().nullable(),
      proRataPercent: z.number().int().nullable(),
      approvedReplacementSerial: z.string().nullable(),
      rejectionReason: z.string().nullable(),
      replacementOrderId: z.string().nullable(),
      replacementInvoiceId: z.string().nullable(),
      decidedAt: z.string().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
});

function toComplaintListItem(row: {
  id: string;
  complaintNumber: string;
  status: (typeof SERVICE_STATUS_VALUES)[number];
  issueCategory: string;
  title: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerState?: string | null;
  customerCity?: string | null;
  alternatePhone?: string | null;
  resolutionReason?: z.infer<typeof resolutionReasonSchema> | null;
  happyCallingStatus?: z.infer<typeof happyCallingStatusSchema> | null;
  raisedByUserId: string | null;
  raisedByServiceUserId: string | null;
  rsmUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{ serialNumber: string }>;
  assignments?: Array<{
    asiUser: { name: string } | null;
    seUser: { name: string } | null;
  }>;
}) {
  return {
    id: row.id,
    complaintNumber: row.complaintNumber,
    status: row.status,
    issueCategory: row.issueCategory,
    title: row.title,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerState: row.customerState ?? null,
    customerCity: row.customerCity ?? null,
    alternatePhone: row.alternatePhone ?? null,
    resolutionReason: row.resolutionReason ?? null,
    happyCallingStatus: row.happyCallingStatus ?? null,
    raisedByUserId: row.raisedByUserId,
    raisedByServiceUserId: row.raisedByServiceUserId,
    rsmUserId: row.rsmUserId ?? null,
    assignedAsiName: row.assignments?.[0]?.asiUser?.name ?? null,
    assignedSeName: row.assignments?.[0]?.seUser?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    serials: row.lines.map((line) => line.serialNumber),
  };
}


function buildDetailResponse(row: DetailRow) {
  return {
    ...toComplaintListItem({
      ...row,
      assignments: row.assignments.slice(0, 1),
    }),
    description: row.description,
    complainantType: row.complainantType,
    thirdPartyName: row.thirdPartyName,
    thirdPartyPhone: row.thirdPartyPhone,
    customerPincode: row.customerPincode ?? null,
    customerAddress: row.customerAddress ?? null,
    rsmUserName: row.rsmUser?.name ?? null,
    happyCallingNote: row.happyCallingNote ?? null,
    physicalReturnAt: row.physicalReturnAt?.toISOString() ?? null,
    physicalReturnNote: row.physicalReturnNote ?? null,
    causeOfFailure: row.testReports[0]?.causeOfFailure ?? null,
    telephonicReason: row.telephonicReason,
    resolutionNote: row.resolutionNote,
    closedAt: row.closedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    lines: row.lines.map(toComplaintLine),
    assignments: row.assignments.map((a) => ({
      id: a.id,
      action: a.action,
      note: a.note,
      asiUserId: a.asiUserId,
      seUserId: a.seUserId,
      asiUserName: a.asiUser?.name ?? null,
      seUserName: a.seUser?.name ?? null,
      assignedById: a.assignedById,
      createdAt: a.createdAt.toISOString(),
    })),
    tests: row.testReports.map((t) => ({
      id: t.id,
      complaintLineId: t.complaintLineId,
      submittedById: t.submittedById,
      submittedByName: t.submittedBy?.name ?? null,
      verdict: t.verdict,
      summary: t.summary,
      causeOfFailure: t.causeOfFailure,
      structuredData: t.structuredData ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    activities: row.activities.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      actorName: a.actor?.name ?? null,
      action: a.action,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      note: a.note,
      meta: a.meta ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    warrantyDecision: row.warrantyDecision
      ? {
          id: row.warrantyDecision.id,
          status: row.warrantyDecision.status,
          decidedById: row.warrantyDecision.decidedById,
          fulfillmentRoute: row.warrantyDecision.fulfillmentRoute,
          sourceWarehouseId: row.warrantyDecision.sourceWarehouseId,
          sourceOutletId: row.warrantyDecision.sourceOutletId,
          claimingOutletId: row.warrantyDecision.claimingOutletId,
          proRataPercent: row.warrantyDecision.proRataPercent,
          approvedReplacementSerial: row.warrantyDecision.approvedReplacementSerial,
          rejectionReason: row.warrantyDecision.rejectionReason,
          replacementOrderId: row.warrantyDecision.replacementOrderId,
          replacementInvoiceId: row.warrantyDecision.replacementInvoiceId,
          decidedAt: row.warrantyDecision.decidedAt?.toISOString() ?? null,
          updatedAt: row.warrantyDecision.updatedAt.toISOString(),
        }
      : null,
  };
}

function toComplaintLine(line: {
  id: string;
  sku: string;
  serialNumber: string;
  normalizedSerial: string;
  replacementSerialNumber: string | null;
  normalizedReplacementSerial: string | null;
  productId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: line.id,
    sku: line.sku,
    serialNumber: line.serialNumber,
    normalizedSerial: line.normalizedSerial,
    replacementSerialNumber: line.replacementSerialNumber,
    normalizedReplacementSerial: line.normalizedReplacementSerial,
    productId: line.productId,
    notes: line.notes,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  };
}

const DETAIL_INCLUDE = {
  lines: true,
  rsmUser: { select: { name: true } },
  assignments: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      asiUser: { select: { name: true } },
      seUser: { select: { name: true } },
    },
  },
  testReports: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { submittedBy: { select: { name: true } } },
  },
  activities: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { actor: { select: { name: true } } },
  },
  warrantyDecision: true,
} satisfies Prisma.ServiceComplaintInclude;

type DetailRow = Prisma.ServiceComplaintGetPayload<{ include: typeof DETAIL_INCLUDE }>;

export const serviceComplaintsRouter = createTRPCRouter({
  list: internalPerm(P.service.read)
    .input(
      paginationInputSchema.extend({
        status: complaintStatusSchema.optional(),
        q: z.string().min(1).optional(),
        customerState: z.string().trim().min(1).optional(),
        outletId: z.string().uuid().optional(),
        asiUserId: z.string().uuid().optional(),
        rsmUserId: z.string().uuid().optional(),
        happyCallingStatus: happyCallingStatusSchema.optional(),
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
      const orgId = requireOrgId(ctx.actor.orgId);
      const cursor = decodeCursor(input.cursor);
      const scopeFilter = await serviceComplaintAccessWhere(ctx, orgId);

      // Resolve outlet → serials sold by that outlet so we can filter complaint lines.
      let outletSerials: string[] | null = null;
      if (input.outletId) {
        const sold = await ctx.prisma.serviceSerialIndex.findMany({
          where: { orgId, soldOutletId: input.outletId },
          select: { normalizedSerial: true },
        });
        outletSerials = sold.map((s) => s.normalizedSerial);
        // No serials → no matches; short-circuit with an impossible filter.
        if (outletSerials.length === 0) outletSerials = ["__no_match__"];
      }

      const baseFilter = {
        ...scopeFilter,
        ...(input.customerState ? { customerState: input.customerState } : {}),
        ...(input.rsmUserId ? { rsmUserId: input.rsmUserId } : {}),
        ...(input.happyCallingStatus ? { happyCallingStatus: input.happyCallingStatus } : {}),
        ...(input.asiUserId
          ? { assignments: { some: { asiUserId: input.asiUserId } } }
          : {}),
        ...(outletSerials
          ? { lines: { some: { normalizedSerial: { in: outletSerials } } } }
          : {}),
        AND: [
          ...(input.q ? [{ OR: [
            { complaintNumber: { contains: input.q, mode: "insensitive" as const } },
            { title: { contains: input.q, mode: "insensitive" as const } },
            { description: { contains: input.q, mode: "insensitive" as const } },
            { customerName: { contains: input.q, mode: "insensitive" as const } },
            { customerPhone: { contains: input.q, mode: "insensitive" as const } },
            { lines: { some: { OR: [
              { sku: { contains: input.q, mode: "insensitive" as const } },
              { serialNumber: { contains: input.q, mode: "insensitive" as const } },
              { replacementSerialNumber: { contains: input.q, mode: "insensitive" as const } },
            ] } } },
          ] }] : []),
        ],
      };

      const pageWhere = {
        ...baseFilter,
        AND: [
          ...baseFilter.AND,
          ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] }] : []),
        ],
        status: input.status,
      };

      const [rows, allCounts, total] = await Promise.all([
        ctx.prisma.serviceComplaint.findMany({
          where: pageWhere,
          include: {
            lines: { select: { serialNumber: true } },
            assignments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                asiUser: { select: { name: true } },
                seUser: { select: { name: true } },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
        (tabCounts as Record<string, number>)[bucket.status] = bucket._count._all;
      }

      return {
        items: pageRows.map(toComplaintListItem),
        nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null,
        tabCounts,
      };
    }),

  detail: internalPerm(P.service.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(complaintDetailSchema)
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const scopeFilter = await serviceComplaintAccessWhere(ctx, orgId);
      const row = await ctx.prisma.serviceComplaint.findFirst({
        where: { AND: [scopeFilter, { id: input.id }] },
        include: DETAIL_INCLUDE,
      });
      if (!row) throw apiError("NOT_FOUND", "Complaint not found");
      return buildDetailResponse(row);
    }),


  create: internalPerm(P.service.write)
    .input(
      serviceComplaintCreateFieldsSchema.extend({
        // NA03: select existing service user or create inline
        serviceUserId: z.string().uuid().optional(),
        newServiceUser: z
          .object({
            name: z.string().trim().min(1).max(200),
            phone: z.string().trim().min(5).max(40),
            email: z.string().email(),
          })
          .optional(),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;
      const orgId = requireOrgId(ctx.actor.orgId);
      const createdId = await createServiceComplaint(ctx.prisma, {
        ...input,
        orgId,
        activityActorId: actorId,
        raisedByUserId: actorId,
        serviceUserId: input.serviceUserId ?? null,
        newServiceUser: input.newServiceUser ?? null,
      });

      const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
        where: { id: createdId },
        include: DETAIL_INCLUDE,
      });
      return buildDetailResponse(row);
    }),

  update: internalPerm(P.service.write)
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(200).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        resolutionNote: z.string().max(2000).nullable().optional(),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceComplaint.findFirst({
          where: { id: input.id, orgId },
          select: { status: true, title: true, description: true, resolutionNote: true },
        });
        if (!existing) throw apiError("NOT_FOUND", "Complaint not found");

        if (FINAL_STATUSES.has(existing.status)) {
          throw apiError("CONFLICT", "Cannot update a closed complaint");
        }

        await tx.serviceComplaint.update({
          where: { id: input.id },
          data: {
            title: input.title,
            description: input.description,
            resolutionNote: input.resolutionNote,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: "updated",
          note: "Complaint fields updated",
          meta: {
            old: { title: existing.title, description: existing.description, resolutionNote: existing.resolutionNote },
            new: { title: input.title, description: input.description, resolutionNote: input.resolutionNote },
          },
        });
      });

      const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
        where: { id: input.id },
        include: DETAIL_INCLUDE,
      });
      return buildDetailResponse(row);
    }),

  updateLine: internalPermAny(P.service.workflow, P.service.write)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        lineId: z.string().uuid(),
        notes: z.string().max(1000).nullable().optional(),
      }),
    )
    .output(complaintLineSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);
      const scopeFilter = await serviceComplaintAccessWhere(ctx, orgId);

      const result = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceComplaintLine.findFirst({
          where: {
            id: input.lineId,
            complaintId: input.complaintId,
            complaint: scopeFilter,
          },
          include: { complaint: { select: { id: true, status: true } } },
        });
        if (!existing) throw apiError("NOT_FOUND", "Complaint line not found");

        if (FINAL_STATUSES.has(existing.complaint.status)) {
          throw apiError("CONFLICT", "Cannot update lines on a closed complaint");
        }

        const updated = await tx.serviceComplaintLine.update({
          where: { id: input.lineId },
          data: { notes: input.notes },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "line_updated",
          fromStatus: existing.complaint.status,
          toStatus: existing.complaint.status,
          note: "Complaint line notes updated",
          meta: { lineId: input.lineId },
        });

        return updated;
      });

      return toComplaintLine(result);
    }),

  transition: internalPermAny(P.service.workflow, P.service.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        action: transitionActionSchema,
        note: z.string().max(2000).nullable().optional(),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      await assertServiceComplaintAccess(ctx, input.id, orgId);
      if (input.action === "test_submitted") {
        throw apiError("BAD_REQUEST", "Submit test results through serviceTests.submit");
      }
      const actorRole = await resolveServiceActorRole(ctx);
      if (actorRole === "asi") {
        throw apiError("FORBIDDEN", "ASI users can only request retests");
      }
      if (
        actorRole === "service_engineer" &&
        input.action !== "visit_logged" &&
        input.action !== "tested_ok_close"
      ) {
        throw apiError(
          "FORBIDDEN",
          "Service Engineers can only log visits and close tested-ok work",
        );
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
      const scopeFilter = await serviceComplaintAccessWhere(ctx, orgId);

      await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findFirst({
          where: { AND: [scopeFilter, { id: input.id }] },
          select: {
            status: true,
            testReports: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { verdict: true },
            },
          },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
        if (
          input.action === "tested_ok_close" &&
          complaint.testReports[0]?.verdict !== "tested_ok"
        ) {
          throw apiError(
            "CONFLICT",
            "Tested OK closure requires the latest test verdict to be tested_ok",
          );
        }

        const transition = resolveTransition(complaint.status, input.action);

        const nextPatch: {
          status?: (typeof SERVICE_STATUS_VALUES)[number];
          telephonicReason?: string | null;
          resolutionNote?: string | null;
          closedAt?: Date | null;
          cancelledAt?: Date | null;
          visitAt?: Date | null;
          testedAt?: Date | null;
          resolutionReason?: z.infer<typeof resolutionReasonSchema>;
          happyCallingStatus?: z.infer<typeof happyCallingStatusSchema>;
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
          nextPatch.resolutionReason = "telephonic_closure";
          nextPatch.happyCallingStatus = "pending";
        }
        if (input.action === "visit_logged") {
          nextPatch.visitAt = new Date();
        }
        if (input.action === "test_submitted") {
          nextPatch.testedAt = new Date();
        }
        if (input.action === "tested_ok_close" || input.action === "warranty_reject") {
          nextPatch.resolutionNote = input.note ?? "Closed after service decision";
          nextPatch.closedAt = new Date();
          nextPatch.resolutionReason =
            input.action === "tested_ok_close" ? "tested_ok" : "warranty_rejected";
          nextPatch.happyCallingStatus = "pending";
        }
        if (input.action === "cancel") {
          nextPatch.cancelledAt = new Date();
          nextPatch.resolutionReason = "cancelled";
          nextPatch.happyCallingStatus = "pending";
        }

        await tx.serviceComplaint.update({
          where: { id: input.id },
          data: nextPatch,
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: input.action,
          fromStatus: complaint.status,
          toStatus: transition.nextStatus,
          note: input.note,
        });
      });

      const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
        where: { id: input.id },
        include: DETAIL_INCLUDE,
      });
      return buildDetailResponse(row);
    }),

  reopen: internalPerm(P.service.write)
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().trim().min(2).max(2000),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceComplaint.findFirst({
          where: { id: input.id, orgId },
          select: { status: true },
        });
        if (!existing) throw apiError("NOT_FOUND", "Complaint not found");

        if (!FINAL_STATUSES.has(existing.status)) {
          throw apiError("CONFLICT", `Cannot reopen a complaint with status '${existing.status}' — it is not closed`);
        }
        if (existing.status === "cancelled") {
          throw apiError("CONFLICT", "Cancelled complaints cannot be reopened");
        }

        await tx.serviceComplaint.update({
          where: { id: input.id },
          data: {
            status: "raised",
            reopenedAt: new Date(),
            closedAt: null,
            resolutionNote: null,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: "reopen",
          fromStatus: existing.status,
          toStatus: "raised",
          note: input.reason,
        });
      });

      const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
        where: { id: input.id },
        include: DETAIL_INCLUDE,
      });
      return buildDetailResponse(row);
    }),

  relink: internalPerm(P.service.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        raisedByUserId: z.string().uuid().nullable().optional(),
        raisedByServiceUserId: z.string().uuid().nullable().optional(),
        reason: z.string().trim().min(2).max(2000),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      if (input.raisedByUserId === undefined && input.raisedByServiceUserId === undefined) {
        throw apiError("BAD_REQUEST", "Provide raisedByUserId or raisedByServiceUserId");
      }

      await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceComplaint.findFirst({
          where: { id: input.id, orgId },
          select: { status: true, raisedByUserId: true, raisedByServiceUserId: true },
        });
        if (!existing) throw apiError("NOT_FOUND", "Complaint not found");

        await tx.serviceComplaint.update({
          where: { id: input.id },
          data: {
            raisedByUserId: input.raisedByUserId !== undefined ? input.raisedByUserId : existing.raisedByUserId,
            raisedByServiceUserId: input.raisedByServiceUserId !== undefined ? input.raisedByServiceUserId : existing.raisedByServiceUserId,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: "relink",
          fromStatus: existing.status,
          toStatus: existing.status,
          note: input.reason,
          meta: {
            old: { raisedByUserId: existing.raisedByUserId, raisedByServiceUserId: existing.raisedByServiceUserId },
            new: {
              raisedByUserId:
                input.raisedByUserId !== undefined
                  ? input.raisedByUserId
                  : existing.raisedByUserId,
              raisedByServiceUserId:
                input.raisedByServiceUserId !== undefined
                  ? input.raisedByServiceUserId
                  : existing.raisedByServiceUserId,
            },
          },
        });
      });

      const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
        where: { id: input.id },
        include: DETAIL_INCLUDE,
      });
      return buildDetailResponse(row);
    }),

  batchCreate: internalPerm(P.service.write)
    .input(
      serviceComplaintCreateFieldsSchema
        .omit({ sku: true, serialNumber: true, notes: true })
        .extend({
          serviceUserId: z.string().uuid().optional(),
          newServiceUser: z
            .object({
              name: z.string().trim().min(1).max(200),
              phone: z.string().trim().min(5).max(40),
              email: z.string().email(),
            })
            .optional(),
          lines: z
            .array(
              z.object({
                sku: z.string().trim().min(1).max(100),
                serialNumber: z.string().trim().min(2).max(200),
                notes: z.string().trim().max(1000).optional(),
              }),
            )
            .min(1)
            .max(20),
        }),
    )
    .output(
      z.object({
        complaints: z.array(
          z.object({
            id: z.string(),
            complaintNumber: z.string(),
            serialNumber: z.string(),
          }),
        ),
        failures: z.array(
          z.object({
            serialNumber: z.string(),
            message: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id!;
      const orgId = requireOrgId(ctx.actor.orgId);
      const { lines, serviceUserId, newServiceUser, ...shared } = input;

      const complaints: Array<{ id: string; complaintNumber: string; serialNumber: string }> = [];
      const failures: Array<{ serialNumber: string; message: string }> = [];

      for (const line of lines) {
        try {
          const createdId = await createServiceComplaint(ctx.prisma, {
            ...shared,
            sku: line.sku,
            serialNumber: line.serialNumber,
            notes: line.notes,
            orgId,
            activityActorId: actorId,
            raisedByUserId: actorId,
            serviceUserId: serviceUserId ?? null,
            newServiceUser: newServiceUser ?? null,
          });
          const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
            where: { id: createdId },
            select: { id: true, complaintNumber: true },
          });
          complaints.push({
            id: row.id,
            complaintNumber: row.complaintNumber,
            serialNumber: line.serialNumber,
          });
        } catch (err) {
          failures.push({
            serialNumber: line.serialNumber,
            message: err instanceof Error ? err.message : "Failed to create complaint",
          });
        }
      }

      if (complaints.length === 0) {
        throw apiError("BAD_REQUEST", failures[0]?.message ?? "No complaints could be created");
      }

      return { complaints, failures };
    }),

  listHappyCalling: internalPerm(P.service["happy-calling"])
    .input(
      paginationInputSchema.extend({
        status: happyCallingStatusSchema.default("pending"),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(complaintListItemSchema),
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const cursor = decodeCursor(input.cursor);
      const where: Prisma.ServiceComplaintWhereInput = {
        orgId,
        happyCallingStatus: input.status,
        ...(input.fromDate || input.toDate
          ? {
              closedAt: {
                ...(input.fromDate ? { gte: input.fromDate } : {}),
                ...(input.toDate ? { lte: input.toDate } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.ts) } },
                { createdAt: new Date(cursor.ts), id: { lt: cursor.id } },
              ],
            }
          : {}),
      };

      const rows = await ctx.prisma.serviceComplaint.findMany({
        where,
        include: {
          lines: { select: { serialNumber: true } },
          assignments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              asiUser: { select: { name: true } },
              seUser: { select: { name: true } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });

      const hasMore = rows.length > input.limit;
      const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: pageRows.map(toComplaintListItem),
        nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null,
      };
    }),

  updateHappyCalling: internalPerm(P.service["happy-calling"])
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["completed", "skipped"]),
        note: z.string().trim().max(2000).nullable().optional(),
        physicalReturn: z
          .object({
            returnedAt: z.coerce.date().optional(),
            note: z.string().trim().max(2000).optional(),
          })
          .optional(),
      }),
    )
    .output(complaintDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceComplaint.findFirst({
          where: { id: input.id, orgId },
          select: { status: true, happyCallingStatus: true },
        });
        if (!existing) throw apiError("NOT_FOUND", "Complaint not found");
        if (existing.happyCallingStatus == null) {
          throw apiError("CONFLICT", "Complaint is not in the happy-calling queue");
        }

        await tx.serviceComplaint.update({
          where: { id: input.id },
          data: {
            happyCallingStatus: input.status,
            happyCallingNote: input.note ?? undefined,
            ...(input.physicalReturn
              ? {
                  physicalReturnAt: input.physicalReturn.returnedAt ?? new Date(),
                  physicalReturnNote: input.physicalReturn.note ?? null,
                }
              : {}),
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.id,
          actorId,
          action: "happy_calling",
          fromStatus: existing.status,
          toStatus: existing.status,
          note: input.note ?? null,
          meta: {
            happyCallingStatus: input.status,
            physicalReturn: input.physicalReturn
              ? {
                  returnedAt: (input.physicalReturn.returnedAt ?? new Date()).toISOString(),
                  note: input.physicalReturn.note ?? null,
                }
              : null,
          },
        });
      });

      const row = await ctx.prisma.serviceComplaint.findUniqueOrThrow({
        where: { id: input.id },
        include: DETAIL_INCLUDE,
      });
      return buildDetailResponse(row);
    }),

  tabCounts: internalPerm(P.service.read)
    .output(
      z.object({
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
    )
    .query(async ({ ctx }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const scopeFilter = await serviceComplaintAccessWhere(ctx, orgId);
      const groups = await ctx.prisma.serviceComplaint.groupBy({
        by: ["status"],
        where: scopeFilter,
        _count: { _all: true },
      });
      const counts = {
        all: 0, raised: 0, assigned: 0, visit: 0,
        test_result_submitted: 0, retest_requested: 0,
        resolved: 0, telephonic_closure: 0, cancelled: 0,
      };
      for (const g of groups) {
        (counts as Record<string, number>)[g.status] = g._count._all;
        counts.all += g._count._all;
      }
      return counts;
    }),

});
