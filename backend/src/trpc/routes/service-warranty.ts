import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { normalizeSerial, recordComplaintActivity, resolveTransition } from "./service-shared";

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
  approvedReplacementSerial: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  replacementOrderId: z.string().nullable(),
  decidedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const serviceWarrantyRouter = createTRPCRouter({
  approve: perm(P.service.approve)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        sourceWarehouseId: z.string().uuid(),
        note: z.string().max(1000).optional(),
      }),
    )
    .output(warrantyDecisionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findUnique({
          where: { id: input.complaintId },
          select: { id: true, status: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        resolveTransition(complaint.status, "warranty_approve");

        const decision = await tx.serviceWarrantyDecision.upsert({
          where: { complaintId: input.complaintId },
          create: {
            complaintId: input.complaintId,
            status: "approved",
            decidedById: actorId,
            sourceWarehouseId: input.sourceWarehouseId,
            decidedAt: new Date(),
          },
          update: {
            status: "approved",
            decidedById: actorId,
            sourceWarehouseId: input.sourceWarehouseId,
            decidedAt: new Date(),
            rejectionReason: null,
          },
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "warranty_approve",
          fromStatus: complaint.status,
          toStatus: complaint.status,
          note: input.note ?? null,
          meta: {
            sourceWarehouseId: input.sourceWarehouseId,
          },
        });

        return decision;
      });

      return {
        id: updated.id,
        complaintId: updated.complaintId,
        status: updated.status,
        decidedById: updated.decidedById,
        sourceWarehouseId: updated.sourceWarehouseId,
        approvedReplacementSerial: updated.approvedReplacementSerial,
        rejectionReason: updated.rejectionReason,
        replacementOrderId: updated.replacementOrderId,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  reject: perm(P.service.approve)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        reason: z.string().min(2).max(1000),
      }),
    )
    .output(warrantyDecisionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findUnique({
          where: { id: input.complaintId },
          select: { id: true, status: true },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const transition = resolveTransition(complaint.status, "warranty_reject");

        const decision = await tx.serviceWarrantyDecision.upsert({
          where: { complaintId: input.complaintId },
          create: {
            complaintId: input.complaintId,
            status: "rejected",
            decidedById: actorId,
            rejectionReason: input.reason,
            decidedAt: new Date(),
          },
          update: {
            status: "rejected",
            decidedById: actorId,
            rejectionReason: input.reason,
            decidedAt: new Date(),
          },
        });

        await tx.serviceComplaint.update({
          where: { id: input.complaintId },
          data: {
            status: transition.nextStatus,
            resolutionNote: input.reason,
            closedAt: new Date(),
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
        approvedReplacementSerial: updated.approvedReplacementSerial,
        rejectionReason: updated.rejectionReason,
        replacementOrderId: updated.replacementOrderId,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      };
    }),

  assignReplacement: perm(P.service.approve)
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
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const normalizedReplacementSerial = normalizeSerial(input.replacementSerial);
      const conflict = await ctx.prisma.serviceComplaintLine.findFirst({
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

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const line = await tx.serviceComplaintLine.findUnique({
          where: { id: input.complaintLineId },
          include: {
            complaint: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });
        if (!line || line.complaintId !== input.complaintId) {
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

        await tx.serviceSerialEvent.create({
          data: {
            normalizedSerial: normalizedReplacementSerial,
            eventType: "replacement_serial_assigned",
            entityType: "service_complaint_line",
            entityId: input.complaintLineId,
            meta: {
              complaintId: input.complaintId,
            },
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

  createFulfillmentOrder: perm(P.service.approve)
    .input(
      z.object({
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
    )
    .output(
      z.object({
        orderId: z.string(),
        orderNumber: z.string(),
        complaintId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const result = await ctx.prisma.$transaction(async (tx) => {
        const complaint = await tx.serviceComplaint.findUnique({
          where: { id: input.complaintId },
          include: {
            outlet: true,
            lines: true,
          },
        });
        if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

        const decision = await tx.serviceWarrantyDecision.findUnique({
          where: { complaintId: input.complaintId },
        });
        if (!decision || decision.status !== "approved") {
          throw apiError("CONFLICT", "Warranty must be approved before creating fulfillment order");
        }
        if (decision.replacementOrderId) {
          const existing = await tx.saleOrder.findUnique({
            where: { id: decision.replacementOrderId },
            select: { id: true, orderNumber: true },
          });
          if (existing) {
            return {
              orderId: existing.id,
              orderNumber: existing.orderNumber,
              complaintStatus: complaint.status,
            };
          }
        }

        const outletId = complaint.outletId;
        if (!outletId) {
          throw apiError("BAD_REQUEST", "Complaint does not have an outlet. Set outlet before replacement fulfillment.");
        }

        const outlet = await tx.outlet.findUnique({
          where: { id: outletId },
        });
        if (!outlet) throw apiError("BAD_REQUEST", "Invalid outlet on complaint");

        const lineById = new Map(complaint.lines.map((line) => [line.id, line]));
        for (const requested of input.lines) {
          const exists = lineById.get(requested.complaintLineId);
          if (!exists) {
            throw apiError("BAD_REQUEST", "One or more complaintLineIds do not belong to complaint");
          }
        }

        const products = await tx.product.findMany({
          where: {
            id: { in: input.lines.map((line) => line.productId) },
          },
          select: {
            id: true,
            sku: true,
          },
        });
        if (products.length !== input.lines.length) {
          throw apiError("BAD_REQUEST", "One or more replacement productId values are invalid");
        }

        const skuByProductId = new Map(products.map((product) => [product.id, product.sku]));
        const now = new Date();
        const orderNumber = await nextOrderNumber(tx, now);

        const created = await tx.saleOrder.create({
          data: {
            orderNumber,
            outletId,
            orderType: "warranty_replacement",
            sourceComplaintId: input.complaintId,
            sourceWarehouseId: input.sourceWarehouseId,
            suppressAutoInvoice: true,
            serviceMetadata: {
              reason: "warranty_replacement",
            },
            createdById: actorId,
            approvedById: actorId,
            approvedAt: now,
            orderDate: now,
            deliveryAddress: input.deliveryAddress ?? complaint.outlet?.address ?? outlet.address,
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
          select: {
            id: true,
            orderNumber: true,
          },
        });

        await tx.serviceWarrantyDecision.update({
          where: { complaintId: input.complaintId },
          data: {
            sourceWarehouseId: input.sourceWarehouseId,
            replacementOrderId: created.id,
          },
        });

        await tx.serviceSerialEvent.createMany({
          data: complaint.lines
            .filter((line) => Boolean(line.normalizedReplacementSerial))
            .map((line) => ({
              normalizedSerial: line.normalizedReplacementSerial!,
              eventType: "replacement_order_created",
              entityType: "sale_order",
              entityId: created.id,
              meta: {
                complaintId: input.complaintId,
              },
            })),
        });

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "replacement_order_created",
          fromStatus: complaint.status,
          toStatus: complaint.status,
          note: `Replacement fulfillment order ${created.orderNumber} created`,
          meta: {
            orderId: created.id,
            sourceWarehouseId: input.sourceWarehouseId,
          },
        });

        return {
          orderId: created.id,
          orderNumber: created.orderNumber,
          complaintStatus: complaint.status,
        };
      });

      return {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        complaintId: input.complaintId,
      };
    }),
});
