import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, internalPermAny } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import type { TrpcContext } from "../context";
import { normalizeSerial, recordComplaintActivity, resolveTransition } from "./service-shared";
import { nextInvoiceNumber } from "./orders-shared";
import {
  attachmentSchema,
  confirmPendingAttachment,
  createPendingAttachment,
  removeAttachment,
} from "./attachments";

// Batch 04: refuse null actor orgId rather than silently widening filters.
function requireOrgId(actorOrgId: string | null): string {
  if (!actorOrgId) {
    throw apiError("FORBIDDEN", "Org context required");
  }
  return actorOrgId;
}

async function nextOrderNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const row = await tx.orderSequence.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return `SO-${year}-${String(row.lastSequence).padStart(6, "0")}`;
}

const warrantyDecisionOutputSchema = z.object({
  id: z.string(),
  complaintId: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  decidedById: z.string().nullable(),
  sourceWarehouseId: z.string().nullable(),
  claimingOutletId: z.string().nullable(),
  proRataPercent: z.number().int().nullable(),
  approvedReplacementSerial: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  replacementOrderId: z.string().nullable(),
  decidedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const serviceWarrantyRouter = createTRPCRouter({
  approve: internalPermAny(P.service.approve, P.service.manage)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        sourceWarehouseId: z.string().uuid(),
        proRataPercent: z.number().int().min(0).max(100).optional(),
        claimingOutletId: z.string().uuid().optional(),
        note: z.string().max(1000).nullish(),
      }),
    )
    .output(warrantyDecisionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      const orgId = requireOrgId(ctx.actor.orgId);
      const updated = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findFirst({
          where: { id: input.complaintId, orgId },
          select: { id: true, orgId: true, status: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const transition = resolveTransition(complaint.status, "warranty_approve");

        // SW-003/SW-004: Guard against re-approval or re-opening a rejected decision
        const existingDecision = await tx.serviceWarrantyDecision.findUnique({
          where: { complaintId: input.complaintId },
        });
        if (existingDecision?.status === "approved") {
          throw apiError("CONFLICT", "Warranty decision already approved. Cannot re-approve.");
        }
        if (existingDecision?.status === "rejected") {
          throw apiError("CONFLICT", "Warranty was rejected. Reopen the complaint to re-evaluate.");
        }

        const now = new Date();
        const decision = await tx.serviceWarrantyDecision.upsert({
          where: { complaintId: input.complaintId },
          create: {
            complaintId: input.complaintId,
            status: "approved",
            decidedById: actorId,
            sourceWarehouseId: input.sourceWarehouseId,
            proRataPercent: input.proRataPercent ?? null,
            claimingOutletId: input.claimingOutletId ?? null,
            decidedAt: now,
          },
          update: {
            status: "approved",
            decidedById: actorId,
            sourceWarehouseId: input.sourceWarehouseId,
            proRataPercent: input.proRataPercent ?? null,
            claimingOutletId: input.claimingOutletId ?? null,
            decidedAt: now,
            rejectionReason: null,
          },
        });

        await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: {
            ...(transition.statusChanged ? { status: transition.nextStatus } : {}),
            decidedAt: now,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "warranty_approve",
          fromStatus: complaint.status,
          toStatus: transition.nextStatus,
          note: input.note ?? null,
          meta: { sourceWarehouseId: input.sourceWarehouseId },
        });

        return decision;
      });

      return {
        id: updated.id,
        complaintId: updated.complaintId,
        status: updated.status,
        decidedById: updated.decidedById,
        sourceWarehouseId: updated.sourceWarehouseId,
        claimingOutletId: updated.claimingOutletId ?? null,
        proRataPercent: updated.proRataPercent ?? null,
        approvedReplacementSerial: updated.approvedReplacementSerial,
        rejectionReason: updated.rejectionReason,
        replacementOrderId: updated.replacementOrderId,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  reject: internalPermAny(P.service.approve, P.service.manage)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        reason: z.string().min(2).max(1000),
      }),
    )
    .output(warrantyDecisionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      const orgId = requireOrgId(ctx.actor.orgId);
      const updated = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findFirst({
          where: { id: input.complaintId, orgId },
          select: { id: true, orgId: true, status: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const transition = resolveTransition(complaint.status, "warranty_reject");

        // SW-006: Guard against double-rejection
        const existingDecision = await tx.serviceWarrantyDecision.findUnique({
          where: { complaintId: input.complaintId },
        });
        if (existingDecision?.status === "rejected") {
          throw apiError("CONFLICT", "Warranty decision already rejected.");
        }

        const now = new Date();
        const decision = await tx.serviceWarrantyDecision.upsert({
          where: { complaintId: input.complaintId },
          create: {
            complaintId: input.complaintId,
            status: "rejected",
            decidedById: actorId,
            rejectionReason: input.reason,
            decidedAt: now,
          },
          update: {
            status: "rejected",
            decidedById: actorId,
            rejectionReason: input.reason,
            decidedAt: now,
          },
        });

        await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: {
            status: transition.nextStatus,
            resolutionNote: input.reason,
            decidedAt: now,
            closedAt: now,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "warranty_reject",
          fromStatus: complaint.status,
          toStatus: transition.nextStatus,
          note: input.reason,
        });

        return decision;
      });

      return {
        id: updated.id,
        complaintId: updated.complaintId,
        status: updated.status,
        decidedById: updated.decidedById,
        sourceWarehouseId: updated.sourceWarehouseId,
        claimingOutletId: updated.claimingOutletId ?? null,
        proRataPercent: updated.proRataPercent ?? null,
        approvedReplacementSerial: updated.approvedReplacementSerial,
        rejectionReason: updated.rejectionReason,
        replacementOrderId: updated.replacementOrderId,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  assignReplacement: internalPermAny(P.service.approve, P.service.manage)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        complaintLineId: z.string().uuid(),
        replacementSerial: z.string().min(2),
      }),
    )
    .output(
      z.object({
        complaintLineId: z.string(),
        replacementSerial: z.string(),
        normalizedReplacementSerial: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      const orgId = requireOrgId(ctx.actor.orgId);
      const normalizedReplacementSerial = normalizeSerial(input.replacementSerial);

      const updated = await ctx.prisma.$transaction(async (tx) => {
        // SW-007: Conflict check moved inside the transaction to avoid TOCTOU race
        const conflict = await tx.serviceComplaintLine.findFirst({
          where: {
            normalizedReplacementSerial,
            NOT: {
              complaintId: input.complaintId,
            },
          },
          select: { id: true, complaintId: true },
        });
        if (conflict) {
          throw apiError("CONFLICT", "Replacement serial is already linked to another complaint");
        }

        const line = await tx.serviceComplaintLine.findFirst({
          where: {
            id: input.complaintLineId,
            complaintId: input.complaintId,
            complaint: { orgId },
          },
          include: {
            complaint: {
              select: {
                id: true,
                orgId: true,
                status: true,
              },
            },
          },
        });
        if (!line) {
          throw apiError("NOT_FOUND", "Complaint line not found");
        }

        const patched = await tx.serviceComplaintLine.update({
          where: { id: input.complaintLineId },
          data: {
            replacementSerialNumber: input.replacementSerial,
            normalizedReplacementSerial,
          },
        });

        await tx.serviceWarrantyDecision.upsert({
          where: { complaintId: input.complaintId },
          create: {
            complaintId: input.complaintId,
            status: "pending",
            approvedReplacementSerial: input.replacementSerial,
          },
          update: {
            approvedReplacementSerial: input.replacementSerial,
          },
        });

        await tx.serviceSerialEvent.upsert({
          where: {
            normalizedSerial_entityType_entityId_eventType: {
              normalizedSerial: normalizedReplacementSerial,
              eventType: "replacement_serial_assigned",
              entityType: "service_complaint_line",
              entityId: input.complaintLineId,
            },
          },
          create: {
            normalizedSerial: normalizedReplacementSerial,
            eventType: "replacement_serial_assigned",
            entityType: "service_complaint_line",
            entityId: input.complaintLineId,
            meta: { complaintId: input.complaintId },
          },
          update: {
            meta: { complaintId: input.complaintId },
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "replacement_assigned",
          fromStatus: line.complaint.status,
          toStatus: line.complaint.status,
          note: `Replacement serial ${input.replacementSerial} assigned`,
          meta: {
            complaintLineId: input.complaintLineId,
            replacementSerial: input.replacementSerial,
          },
        });

        return patched;
      });

      return {
        complaintLineId: updated.id,
        replacementSerial: updated.replacementSerialNumber ?? input.replacementSerial,
        normalizedReplacementSerial: updated.normalizedReplacementSerial ?? normalizedReplacementSerial,
      };
    }),

  createFulfillmentOrder: internalPermAny(P.service.approve, P.service.manage)
    .input(
      z.discriminatedUnion("fulfillmentRoute", [
        z.object({
          fulfillmentRoute: z.literal("warehouse"),
          complaintId: z.string().uuid(),
          sourceWarehouseId: z.string().uuid(),
          deliveryAddress: z.string().min(4).optional(),
          lines: z
            .array(
              z.object({
                complaintLineId: z.string().uuid(),
                productId: z.string().uuid(),
                qtyOrdered: z.number().int().positive().default(1),
              }),
            )
            .min(1),
        }),
        z.object({
          fulfillmentRoute: z.literal("outlet"),
          complaintId: z.string().uuid(),
          sourceOutletId: z.string().uuid(),
          lines: z
            .array(
              z.object({
                complaintLineId: z.string().uuid(),
                productId: z.string().uuid(),
                qtyOrdered: z.number().int().positive().default(1),
              }),
            )
            .min(1),
        }),
      ]),
    )
    .output(
      z.object({
        fulfillmentRoute: z.enum(["warehouse", "outlet"]),
        orderId: z.string().nullable(),
        orderNumber: z.string().nullable(),
        invoiceId: z.string().nullable(),
        invoiceNumber: z.string().nullable(),
        complaintId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      const result = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findFirst({
          where: { id: input.complaintId, orgId },
          include: { lines: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const decision = await tx.serviceWarrantyDecision.findUnique({
          where: { complaintId: input.complaintId },
        });
        if (!decision || decision.status !== "approved") {
          throw apiError("CONFLICT", "Warranty must be approved before creating fulfillment order");
        }

        const lineById = new Map(complaint.lines.map((line) => [line.id, line]));
        for (const requested of input.lines) {
          const exists = lineById.get(requested.complaintLineId);
          if (!exists) {
            throw apiError("BAD_REQUEST", "One or more complaintLineIds do not belong to complaint");
          }
          if (!exists.productId) {
            throw apiError("BAD_REQUEST", `Complaint line ${requested.complaintLineId} has no productId`);
          }
        }

        const uniqueProductIds = [...new Set(input.lines.map((line) => line.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: uniqueProductIds } },
          select: { id: true, sku: true, name: true },
        });
        if (products.length !== uniqueProductIds.length) {
          throw apiError("BAD_REQUEST", "One or more product IDs are invalid");
        }
        const skuByProductId = new Map(products.map((p) => [p.id, p.sku]));
        const now = new Date();

        const inputLineIds = new Set(input.lines.map((l) => l.complaintLineId));
        const relevantLines = complaint.lines.filter(
          (l) => inputLineIds.has(l.id) && l.normalizedReplacementSerial,
        );

        if (input.fulfillmentRoute === "warehouse") {
          if (decision.replacementOrderId) {
            const existing = await tx.saleOrder.findUnique({
              where: { id: decision.replacementOrderId },
              select: { id: true, orderNumber: true },
            });
            if (existing) {
              return { fulfillmentRoute: "warehouse" as const, orderId: existing.id, orderNumber: existing.orderNumber, invoiceId: null, invoiceNumber: null };
            }
          }

          const systemOutlet = await tx.outlet.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
          if (!systemOutlet) throw apiError("BAD_REQUEST", "No outlet configured for replacement order");

          const orderNumber = await nextOrderNumber(tx, now);
          const created = await tx.saleOrder.create({
            data: {
              orderNumber,
              outletId: systemOutlet.id,
              orderType: "warranty_replacement",
              sourceComplaintId: input.complaintId,
              sourceWarehouseId: input.sourceWarehouseId,
              suppressAutoInvoice: true,
              serviceMetadata: { reason: "warranty_replacement" },
              createdById: actorId,
              approvedById: actorId,
              approvedAt: now,
              orderDate: now,
              deliveryAddress: input.deliveryAddress ?? "",
              status: "approved",
              priority: "medium",
              totalValue: new Prisma.Decimal(0),
              notes: "Auto-created from service warranty approval",
              lines: {
                create: input.lines.map((line) => ({
                  productId: line.productId,
                  sku: skuByProductId.get(line.productId) ?? "",
                  qtyOrdered: line.qtyOrdered,
                  qtyDispatched: 0,
                  unitPrice: new Prisma.Decimal(0),
                  lineTotal: new Prisma.Decimal(0),
                  status: "pending",
                })),
              },
            },
            select: { id: true, orderNumber: true },
          });

          await tx.serviceWarrantyDecision.update({
            where: { complaintId: input.complaintId },
            data: {
              fulfillmentRoute: "warehouse",
              sourceWarehouseId: input.sourceWarehouseId,
              replacementOrderId: created.id,
              decidedAt: decision.decidedAt ?? now,
            },
          });

          if (relevantLines.length > 0) {
            await tx.serviceSerialEvent.createMany({
              data: relevantLines.map((line) => ({
                normalizedSerial: line.normalizedReplacementSerial!,
                eventType: "replacement_order_created",
                entityType: "sale_order",
                entityId: created.id,
                meta: { complaintId: input.complaintId },
              })),
            });
          }

          await tx.serviceComplaint.update({
            where: { id: input.complaintId },
            data: {
            status: "resolved",
            decidedAt: now,
            closedAt: now,
            resolutionReason: "warranty_approved",
            happyCallingStatus: "pending",
          },
          });

          await recordComplaintActivity(tx, {
            complaintId: input.complaintId,
            actorId,
            action: "replacement_order_created",
            fromStatus: complaint.status,
            toStatus: "resolved",
            note: `Warranty fulfilled via warehouse — order ${created.orderNumber}`,
            meta: { orderId: created.id, sourceWarehouseId: input.sourceWarehouseId },
          });

          return { fulfillmentRoute: "warehouse" as const, orderId: created.id, orderNumber: created.orderNumber, invoiceId: null, invoiceNumber: null };
        }

        // Outlet route (E-04)
        if (decision.replacementInvoiceId) {
          const existing = await tx.invoice.findUnique({
            where: { id: decision.replacementInvoiceId },
            select: { id: true, invoiceNumber: true },
          });
          if (existing) {
            return { fulfillmentRoute: "outlet" as const, orderId: null, orderNumber: null, invoiceId: existing.id, invoiceNumber: existing.invoiceNumber };
          }
        }

        const sourceOutlet = await tx.outlet.findFirst({
          where: { id: input.sourceOutletId, orgId },
          select: { id: true },
        });
        if (!sourceOutlet) throw apiError("NOT_FOUND", "Source outlet not found");

        const orderNumber = await nextOrderNumber(tx, now);
        const replacementOrder = await tx.saleOrder.create({
          data: {
            orderNumber,
            outletId: input.sourceOutletId,
            orderType: "warranty_replacement",
            sourceComplaintId: input.complaintId,
            suppressAutoInvoice: true,
            serviceMetadata: { reason: "warranty_replacement_outlet" },
            createdById: actorId,
            approvedById: actorId,
            approvedAt: now,
            orderDate: now,
            deliveryAddress: "",
            status: "approved",
            priority: "medium",
            totalValue: new Prisma.Decimal(0),
            notes: "Auto-created from service warranty approval (outlet route)",
            lines: {
              create: input.lines.map((line) => ({
                productId: line.productId,
                sku: skuByProductId.get(line.productId) ?? "",
                qtyOrdered: line.qtyOrdered,
                qtyDispatched: 0,
                unitPrice: new Prisma.Decimal(0),
                lineTotal: new Prisma.Decimal(0),
                status: "pending",
              })),
            },
          },
          select: { id: true, orderNumber: true },
        });

        const invoiceNumber = await nextInvoiceNumber(tx, now);
        const createdInvoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            orderId: replacementOrder.id,
            outletId: input.sourceOutletId,
            invoiceDate: now,
            subtotal: new Prisma.Decimal(0),
            discountType: "percentage",
            discountRate: new Prisma.Decimal(100),
            discountAmount: new Prisma.Decimal(0),
            total: new Prisma.Decimal(0),
            amountPaid: new Prisma.Decimal(0),
            amountDue: new Prisma.Decimal(0),
            lines: {
              create: input.lines.map((line) => ({
                productId: line.productId,
                sku: skuByProductId.get(line.productId) ?? "",
                qty: line.qtyOrdered,
                unitPrice: new Prisma.Decimal(0),
                lineTotal: new Prisma.Decimal(0),
              })),
            },
          },
          select: { id: true, invoiceNumber: true },
        });

        await tx.serviceWarrantyDecision.update({
          where: { complaintId: input.complaintId },
          data: {
            fulfillmentRoute: "outlet",
            sourceOutletId: input.sourceOutletId,
            replacementInvoiceId: createdInvoice.id,
            decidedAt: decision.decidedAt ?? now,
          },
        });

        if (relevantLines.length > 0) {
          await tx.serviceSerialEvent.createMany({
            data: relevantLines.map((line) => ({
              normalizedSerial: line.normalizedReplacementSerial!,
              eventType: "replacement_order_created",
              entityType: "sale_order",
              entityId: replacementOrder.id,
              meta: { complaintId: input.complaintId, invoiceId: createdInvoice.id },
            })),
          });
        }

        await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: {
            status: "resolved",
            decidedAt: now,
            closedAt: now,
            resolutionReason: "warranty_approved",
            happyCallingStatus: "pending",
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "replacement_invoice_created",
          fromStatus: complaint.status,
          toStatus: "resolved",
          note: `Warranty fulfilled via outlet — invoice ${createdInvoice.invoiceNumber}`,
          meta: { invoiceId: createdInvoice.id, sourceOutletId: input.sourceOutletId },
        });

        return { fulfillmentRoute: "outlet" as const, orderId: null, orderNumber: null, invoiceId: createdInvoice.id, invoiceNumber: createdInvoice.invoiceNumber };
      });

      return {
        fulfillmentRoute: result.fulfillmentRoute,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        complaintId: input.complaintId,
      };
    }),

  createWarrantyDoc: internalPermAny(P.service.approve, P.service.manage)
    .input(
      z.object({
        warrantyDecisionId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(255),
        fileSize: z.number().int().positive().max(25 * 1024 * 1024),
        expiresInMinutes: z.number().int().min(1).max(60).default(15),
      }),
    )
    .output(
      z.object({
        attachment: attachmentSchema,
        upload: z.object({
          method: z.literal("PUT"),
          uploadUrl: z.string().url(),
          storageKey: z.string(),
          expiresAt: z.string(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      const orgId = requireOrgId(ctx.actor.orgId);
      await assertWarrantyDecisionInOrg(ctx, input.warrantyDecisionId, orgId);
      return createPendingAttachment(
        ctx,
        {
          entityType: "warranty_decision",
          entityId: input.warrantyDecisionId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          expiresInMinutes: input.expiresInMinutes,
        },
        { uploadedById: ctx.actor.id },
      );
    }),

  confirmWarrantyDoc: internalPermAny(P.service.approve, P.service.manage)
    .input(z.object({ attachmentId: z.string().uuid() }))
    .output(attachmentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      const orgId = requireOrgId(ctx.actor.orgId);
      await assertWarrantyDocAccess(ctx, input.attachmentId, orgId);
      return confirmPendingAttachment(ctx, input.attachmentId, { uploadedById: ctx.actor.id });
    }),

  listWarrantyDocs: internalPermAny(P.service.approve, P.service.read, P.service.manage)
    .input(z.object({ warrantyDecisionId: z.string().uuid() }))
    .output(z.object({ items: z.array(attachmentSchema) }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      await assertWarrantyDecisionInOrg(ctx, input.warrantyDecisionId, orgId);
      const rows = await ctx.prisma.attachment.findMany({
        where: { entityType: "warranty_decision", entityId: input.warrantyDecisionId },
        include: { pendingUpload: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          entityType: "warranty_decision" as const,
          entityId: row.entityId,
          fileName: row.fileName,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          storageKey: row.storageKey,
          uploadedById: row.uploadedById,
          uploadedByServiceUserId: row.uploadedByServiceUserId,
          isConfirmed: row.isConfirmed,
          createdAt: row.createdAt.toISOString(),
          pendingUpload: row.pendingUpload
            ? {
                id: row.pendingUpload.id,
                expiresAt: row.pendingUpload.expiresAt.toISOString(),
                createdAt: row.pendingUpload.createdAt.toISOString(),
              }
            : null,
        })),
      };
    }),

  removeWarrantyDoc: internalPermAny(P.service.approve, P.service.manage)
    .input(z.object({ attachmentId: z.string().uuid() }))
    .output(z.object({ id: z.string(), deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) throw apiError("UNAUTHORIZED", "Missing actor context");
      const orgId = requireOrgId(ctx.actor.orgId);
      await assertWarrantyDocAccess(ctx, input.attachmentId, orgId);
      return removeAttachment(ctx, input.attachmentId, { uploadedById: ctx.actor.id });
    }),
});

async function assertWarrantyDecisionInOrg(
  ctx: Pick<TrpcContext, "prisma">,
  warrantyDecisionId: string,
  orgId: string,
) {
  const decision = await ctx.prisma.serviceWarrantyDecision.findFirst({
    where: { id: warrantyDecisionId, complaint: { orgId } },
    select: { id: true },
  });
  if (!decision) throw apiError("NOT_FOUND", "Warranty decision not found");
}

async function assertWarrantyDocAccess(
  ctx: Pick<TrpcContext, "prisma">,
  attachmentId: string,
  orgId: string,
) {
  const attachment = await ctx.prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { entityType: true, entityId: true },
  });
  if (!attachment || attachment.entityType !== "warranty_decision") {
    throw apiError("NOT_FOUND", "Attachment not found");
  }
  await assertWarrantyDecisionInOrg(ctx, attachment.entityId, orgId);
}
