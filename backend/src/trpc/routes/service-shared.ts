import { Prisma, ServiceComplaintStatus } from "@prisma/client";
import { z } from "zod";
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

export const serviceComplaintCreateFieldsSchema = z.object({
  issueCategory: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(5).max(40),
  complainantType: z.enum(["self", "on_behalf_of"]).default("self"),
  thirdPartyName: z.string().trim().min(1).max(200).optional(),
  thirdPartyPhone: z.string().trim().min(5).max(40).optional(),
  customerState: z.string().trim().max(100).optional(),
  customerCity: z.string().trim().max(100).optional(),
  customerPincode: z.string().trim().max(20).optional(),
  customerAddress: z.string().trim().max(500).optional(),
  alternatePhone: z.string().trim().min(5).max(40).optional(),
  sku: z.string().trim().min(1).max(100),
  serialNumber: z.string().trim().min(2).max(200),
  notes: z.string().trim().max(1000).optional(),
});

export type ServiceComplaintCreateFields = z.infer<typeof serviceComplaintCreateFieldsSchema>;

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
      if (currentStatus !== "test_result_submitted") {
        throw apiError("CONFLICT", "Tested OK closure requires a submitted test result");
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
  const result = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('service_complaint_number_seq')`;
  const seq = Number(result[0].nextval);
  return `CMP-${year}-${String(seq).padStart(6, "0")}`;
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

type SerialDb = Pick<
  Prisma.TransactionClient,
  "dispatchLineSerial" | "dispatchLine" | "serviceSerialIndex" | "serviceSerialEvent"
>;

async function findSerialLegacyDispatchRowsWithDb(db: SerialDb, normalizedSerial: string) {
  const refs = await db.dispatchLineSerial.findMany({
    where: { normalizedSerial },
    select: { dispatchLineId: true },
  });

  if (refs.length === 0) return [];

  const ids = refs.map((r) => r.dispatchLineId);

  return db.dispatchLine.findMany({
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

export async function findSerialLegacyDispatchRows(ctx: TrpcContext, normalizedSerial: string) {
  return findSerialLegacyDispatchRowsWithDb(ctx.prisma, normalizedSerial);
}

async function ensureSerialIndexWithDb(
  db: SerialDb,
  input: { serial: string; orgId: string | null },
) {
  const serial = input.serial;
  const normalizedSerial = normalizeSerial(serial);
  if (!normalizedSerial) {
    throw apiError("BAD_REQUEST", "Serial must contain alphanumeric characters");
  }

  const existing = await db.serviceSerialIndex.findUnique({
    where: { normalizedSerial },
  });
  if (existing?.hydratedLegacy) {
    return existing;
  }

  const legacyRows = await findSerialLegacyDispatchRowsWithDb(db, normalizedSerial);
  const first = legacyRows[0];
  const now = new Date();

  const upserted = await db.serviceSerialIndex.upsert({
    where: { normalizedSerial },
    create: {
      normalizedSerial,
      orgId: input.orgId,
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
    const existingEventCount = await db.serviceSerialEvent.count({
      where: { normalizedSerial },
    });
    if (existingEventCount === 0) {
      await db.serviceSerialEvent.createMany({
        data: legacyRows.slice(0, 10).map((row) => ({
          normalizedSerial,
          orgId: input.orgId,
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

export async function ensureSerialIndex(ctx: TrpcContext, serial: string) {
  return ensureSerialIndexWithDb(ctx.prisma, {
    serial,
    orgId: ctx.actor.orgId ?? null,
  });
}

export async function createServiceComplaint(
  prisma: TrpcContext["prisma"],
  input: ServiceComplaintCreateFields & {
    orgId: string;
    activityActorId?: string | null;
    raisedByUserId?: string | null;
    serviceUserId?: string | null;
    newServiceUser?: { name: string; phone: string; email: string } | null;
  },
) {
  if (
    input.complainantType === "on_behalf_of" &&
    (!input.thirdPartyName?.trim() || !input.thirdPartyPhone?.trim())
  ) {
    throw apiError(
      "BAD_REQUEST",
      "Third-party name and phone are required when complainant type is on_behalf_of",
    );
  }
  if (input.serviceUserId && input.newServiceUser) {
    throw apiError("BAD_REQUEST", "Choose an existing service user or create a new one, not both");
  }

  const normalizedSerial = normalizeSerial(input.serialNumber);
  if (!normalizedSerial) {
    throw apiError("BAD_REQUEST", "Serial must contain alphanumeric characters");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedSerial}))`;

    const product = await tx.product.findFirst({
      where: {
        sku: input.sku,
        isActive: true,
        category: {
          isActive: true,
          brand: { isActive: true },
        },
      },
      select: { id: true, sku: true },
    });
    if (!product) {
      throw apiError("BAD_REQUEST", `No product found for SKU ${input.sku}`);
    }

    const existing = await tx.serviceComplaint.findFirst({
      where: {
        orgId: input.orgId,
        lines: { some: { normalizedSerial } },
        status: { notIn: [...FINAL_STATUSES] },
      },
      select: { complaintNumber: true },
    });
    if (existing) {
      throw apiError(
        "CONFLICT",
        `Serial ${input.serialNumber} already has an open complaint: ${existing.complaintNumber}`,
      );
    }

    let raisedByServiceUserId = input.serviceUserId ?? null;
    if (raisedByServiceUserId) {
      const serviceUser = await tx.serviceUser.findUnique({
        where: { id: raisedByServiceUserId },
        select: { id: true, isActive: true },
      });
      if (!serviceUser?.isActive) {
        throw apiError("BAD_REQUEST", "Service user not found or inactive");
      }
    } else if (input.newServiceUser) {
      const serviceUser = await tx.serviceUser.create({
        data: {
          name: input.newServiceUser.name.trim(),
          phone: input.newServiceUser.phone.trim(),
          email: input.newServiceUser.email.trim().toLowerCase(),
          passwordHash: await Bun.password.hash(crypto.randomUUID()),
        },
        select: { id: true },
      });
      raisedByServiceUserId = serviceUser.id;
    }

    const raisedByUserId = raisedByServiceUserId ? null : (input.raisedByUserId ?? null);
    if (!raisedByUserId && !raisedByServiceUserId) {
      throw apiError("BAD_REQUEST", "Complaint raiser is required");
    }

    const now = new Date();
    const complaintNumber = await nextComplaintNumber(tx, now);
    const complaint = await tx.serviceComplaint.create({
      data: {
        complaintNumber,
        orgId: input.orgId,
        status: "raised",
        issueCategory: input.issueCategory,
        title: input.title || null,
        description: input.description || null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        complainantType: input.complainantType,
        thirdPartyName: input.thirdPartyName ?? null,
        thirdPartyPhone: input.thirdPartyPhone ?? null,
        customerState: input.customerState ?? null,
        customerCity: input.customerCity ?? null,
        customerPincode: input.customerPincode ?? null,
        customerAddress: input.customerAddress ?? null,
        alternatePhone: input.alternatePhone ?? null,
        raisedByUserId,
        raisedByServiceUserId,
        lines: {
          create: {
            sku: product.sku,
            serialNumber: input.serialNumber.trim(),
            normalizedSerial,
            productId: product.id,
            notes: input.notes ?? null,
          },
        },
      },
      select: { id: true },
    });

    await recordComplaintActivity(tx, {
      complaintId: complaint.id,
      actorId: input.activityActorId ?? null,
      action: "raised",
      fromStatus: null,
      toStatus: "raised",
      note: input.description ?? null,
    });
    await ensureSerialIndexWithDb(tx, {
      serial: input.serialNumber.trim(),
      orgId: input.orgId,
    });

    return complaint.id;
  });
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
