import { Prisma, ServiceComplaintStatus } from "@prisma/client";
import type { TrpcContext } from "../context";
import { apiError } from "../error";

export const SERVICE_STATUS_VALUES = [
  "raised",
  "assigned",
  "visit",
  "test_result_submitted",
  "retest_requested",
  "resolved",
  "telephonic_closure",
  "cancelled",
] as const;

export const SERVICE_TRANSITION_ACTIONS = [
  "assign",
  "visit_logged",
  "test_submitted",
  "retest_requested",
  "telephonic_close",
  "tested_ok_close",
  "warranty_approve",
  "warranty_reject",
  "cancel",
] as const;

export type ServiceTransitionAction = (typeof SERVICE_TRANSITION_ACTIONS)[number];

type TransitionResolution = {
  nextStatus: ServiceComplaintStatus;
  statusChanged: boolean;
};

export const FINAL_STATUSES = new Set<ServiceComplaintStatus>([
  "resolved",
  "telephonic_closure",
  "cancelled",
]);

export function normalizeSerial(serial: string) {
  return serial.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseSerialNumbers(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === "string");
}

export function resolveTransition(
  currentStatus: ServiceComplaintStatus,
  action: ServiceTransitionAction,
): TransitionResolution {
  if (FINAL_STATUSES.has(currentStatus)) {
    throw apiError("CONFLICT", `Complaint is already closed in status ${currentStatus}`);
  }

  switch (action) {
    case "assign": {
      if (currentStatus !== "raised") {
        throw apiError("CONFLICT", "Assignment can only move complaint from raised to assigned");
      }
      return { nextStatus: "assigned", statusChanged: true };
    }
    case "visit_logged": {
      if (currentStatus !== "assigned" && currentStatus !== "retest_requested") {
        throw apiError("CONFLICT", "Visit can be logged only from assigned or retest_requested state");
      }
      return { nextStatus: "visit", statusChanged: true };
    }
    case "test_submitted": {
      if (currentStatus !== "visit") {
        throw apiError("CONFLICT", "Test result can be submitted only from visit state");
      }
      return { nextStatus: "test_result_submitted", statusChanged: true };
    }
    case "retest_requested": {
      if (currentStatus !== "test_result_submitted") {
        throw apiError("CONFLICT", "Retest can be requested only after a test result is submitted");
      }
      return { nextStatus: "retest_requested", statusChanged: true };
    }
    case "telephonic_close": {
      if (currentStatus !== "raised" && currentStatus !== "assigned") {
        throw apiError("CONFLICT", "Telephonic closure only allowed from raised or assigned status");
      }
      return { nextStatus: "telephonic_closure", statusChanged: true };
    }
    case "tested_ok_close": {
      if (currentStatus !== "test_result_submitted" && currentStatus !== "visit") {
        throw apiError("CONFLICT", "Tested OK closure requires visit/test progression first");
      }
      return { nextStatus: "resolved", statusChanged: true };
    }
    case "warranty_approve": {
      if (currentStatus !== "test_result_submitted") {
        throw apiError("CONFLICT", "Warranty approval requires submitted test result");
      }
      return { nextStatus: currentStatus, statusChanged: false };
    }
    case "warranty_reject": {
      if (currentStatus !== "test_result_submitted") {
        throw apiError("CONFLICT", "Warranty rejection requires submitted test result");
      }
      return { nextStatus: "resolved", statusChanged: true };
    }
    case "cancel": {
      return { nextStatus: "cancelled", statusChanged: true };
    }
    default:
      throw apiError("BAD_REQUEST", "Unsupported transition action");
  }
}

export async function nextComplaintNumber(tx: Prisma.TransactionClient, now: Date, orgId: string) {
  const year = now.getUTCFullYear();
  await tx.$executeRaw`
    INSERT INTO service_complaint_sequences ("orgId", year, "lastSequence")
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT ("orgId", year) DO UPDATE SET "lastSequence" = service_complaint_sequences."lastSequence" + 1
  `;
  const row = await tx.serviceComplaintSequence.findUnique({ where: { orgId_year: { orgId, year } } });
  return `CMP-${year}-${String(row!.lastSequence).padStart(6, "0")}`;
}

export function assertOrgAccess(actorOrgId: string | null, resourceOrgId: string | null, resourceName = "resource"): void {
  if (actorOrgId !== null && resourceOrgId !== actorOrgId) {
    throw apiError("NOT_FOUND", `${resourceName} not found`);
  }
}

export async function recordComplaintActivity(
  tx: Prisma.TransactionClient,
  input: {
    complaintId: string;
    actorId?: string | null;
    action: string;
    fromStatus?: ServiceComplaintStatus | null;
    toStatus?: ServiceComplaintStatus | null;
    note?: string | null;
    meta?: Prisma.JsonValue;
  },
) {
  await tx.serviceComplaintActivity.create({
    data: {
      complaintId: input.complaintId,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      meta: input.meta ?? Prisma.JsonNull,
    },
  });

  if (input.actorId) {
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `service.${input.action}`,
        entityType: "service_complaint",
        entityId: input.complaintId,
        meta: {
          fromStatus: input.fromStatus ?? null,
          toStatus: input.toStatus ?? null,
          note: input.note ?? null,
          details: input.meta ?? null,
        },
      },
    });
  }
}

export async function findSerialLegacyDispatchRows(ctx: TrpcContext, normalizedSerial: string) {
  const refs = await ctx.prisma.dispatchLineSerial.findMany({
    where: { normalizedSerial },
    select: { dispatchLineId: true },
  });

  if (refs.length === 0) return [];

  const ids = refs.map((r) => r.dispatchLineId);

  return ctx.prisma.dispatchLine.findMany({
    where: { id: { in: ids } },
    include: {
      dispatch: {
        select: {
          id: true,
          dispatchDate: true,
          deliveryStatus: true,
          deliveredAt: true,
          warehouseId: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          category: {
            select: {
              id: true,
              name: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      orderLine: {
        select: {
          id: true,
          orderId: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              outletId: true,
              outlet: {
                select: {
                  id: true,
                  name: true,
                  outletCode: true,
                },
              },
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  invoiceDate: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ dispatch: { dispatchDate: "asc" } }, { id: "asc" }],
  });
}

export async function ensureSerialIndex(ctx: TrpcContext, serial: string) {
  const normalizedSerial = normalizeSerial(serial);
  if (!normalizedSerial) {
    throw apiError("BAD_REQUEST", "Serial must contain alphanumeric characters");
  }

  const existing = await ctx.prisma.serviceSerialIndex.findUnique({
    where: { normalizedSerial },
  });
  if (existing?.hydratedLegacy) {
    return existing;
  }

  const legacyRows = await findSerialLegacyDispatchRows(ctx, normalizedSerial);
  const first = legacyRows[0];
  const now = new Date();

  const orgId = ctx.actor.orgId ?? null;

  const upserted = await ctx.prisma.serviceSerialIndex.upsert({
    where: { normalizedSerial },
    create: {
      normalizedSerial,
      orgId,
      serialNumber: serial,
      productId: first?.productId,
      soldOutletId: first?.orderLine.order.outletId,
      firstSeenAt: first?.dispatch.dispatchDate ?? now,
      lastSeenAt: now,
      hydratedLegacy: legacyRows.length > 0,
    },
    update: {
      hydratedLegacy: true,
      // Do NOT update serialNumber or orgId — preserve first-seen canonical form
      productId: first?.productId ?? existing?.productId ?? undefined,
      soldOutletId: first?.orderLine.order.outletId ?? existing?.soldOutletId ?? undefined,
      updatedAt: new Date(),
    },
  });

  if (legacyRows.length > 0) {
    const existingEventCount = await ctx.prisma.serviceSerialEvent.count({
      where: { normalizedSerial },
    });
    if (existingEventCount === 0) {
      await ctx.prisma.serviceSerialEvent.createMany({
        data: legacyRows.slice(0, 10).map((row) => ({
          normalizedSerial,
          orgId,
          eventType: "legacy_dispatch_hydrated",
          entityType: "dispatch_line",
          entityId: row.id,
          eventAt: row.dispatch.dispatchDate,
          meta: {
            dispatchId: row.dispatchId,
            orderId: row.orderLine.orderId,
            outletId: row.orderLine.order.outletId,
          },
        })),
        skipDuplicates: true,
      });
    }
  }

  return upserted;
}

export async function assertServiceReadable(ctx: TrpcContext, complaintId: string) {
  const complaint = await ctx.prisma.serviceComplaint.findUnique({
    where: { id: complaintId },
    select: { id: true },
  });
  if (!complaint) {
    throw apiError("NOT_FOUND", "Complaint not found");
  }
  return complaint;
}
