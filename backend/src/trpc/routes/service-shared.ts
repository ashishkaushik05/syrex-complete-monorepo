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

const FINAL_STATUSES = new Set<ServiceComplaintStatus>([
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

export async function nextComplaintNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const row = await tx.serviceComplaintSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return `CMP-${year}-${String(row.lastSequence).padStart(6, "0")}`;
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
      meta: input.meta ?? undefined,
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

function serialMatches(serial: string, normalized: string) {
  return normalizeSerial(serial) === normalized;
}

export async function findSerialLegacyDispatchRows(ctx: TrpcContext, normalizedSerial: string) {
  const rows = await ctx.prisma.dispatchLine.findMany({
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

  return rows.filter((row) =>
    parseSerialNumbers(row.serialNumbers).some((serial) => serialMatches(serial, normalizedSerial)),
  );
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

  const upserted = await ctx.prisma.serviceSerialIndex.upsert({
    where: { normalizedSerial },
    create: {
      normalizedSerial,
      serialNumber: serial,
      productId: first?.productId,
      soldOutletId: first?.orderLine.order.outletId,
      firstSeenAt: first?.dispatch.dispatchDate ?? now,
      lastSeenAt: now,
      hydratedLegacy: legacyRows.length > 0,
    },
    update: {
      serialNumber: serial,
      productId: first?.productId ?? existing?.productId ?? null,
      soldOutletId: first?.orderLine.order.outletId ?? existing?.soldOutletId ?? null,
      lastSeenAt: now,
      hydratedLegacy: legacyRows.length > 0 || existing?.hydratedLegacy === true,
    },
  });

  if (legacyRows.length > 0) {
    await ctx.prisma.serviceSerialEvent.createMany({
      data: legacyRows.slice(0, 3).map((row) => ({
        normalizedSerial,
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
