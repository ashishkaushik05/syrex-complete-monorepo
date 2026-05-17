import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { ensureSerialIndex, findSerialLegacyDispatchRows, normalizeSerial } from "./service-shared";

const serialChainSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  dispatchId: z.string(),
  dispatchDate: z.string(),
  deliveryStatus: z.string(),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  outletId: z.string().nullable(),
  outletName: z.string().nullable(),
  outletCode: z.string().nullable(),
  warehouseId: z.string(),
});

const complaintLinkSchema = z.object({
  complaintId: z.string(),
  complaintNumber: z.string(),
  complaintStatus: z.string(),
  role: z.enum(["old_serial", "replacement_serial"]),
  lineId: z.string(),
});

const serialResolveSchema = z.object({
  serial: z.string(),
  normalizedSerial: z.string(),
  product: z
    .object({
      id: z.string(),
      name: z.string(),
      sku: z.string(),
      categoryId: z.string().nullable(),
      categoryName: z.string().nullable(),
      brandName: z.string().nullable(),
    })
    .nullable(),
  soldToOutlet: z
    .object({
      id: z.string(),
      name: z.string(),
      outletCode: z.string().nullable(),
    })
    .nullable(),
  salesChain: z.array(serialChainSchema),
  complaintLinks: z.array(complaintLinkSchema),
  replacementConflict: z.object({
    hasConflict: z.boolean(),
    usedInComplaintIds: z.array(z.string()),
  }),
  events: z.array(
    z.object({
      id: z.string(),
      eventType: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      eventAt: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const serviceSerialsRouter = createTRPCRouter({
  resolve: perm(P.service.read)
    .input(
      z.object({
        serial: z.string().min(2),
      }),
    )
    .output(serialResolveSchema)
    .query(async ({ ctx, input }) => {
      const normalizedSerial = normalizeSerial(input.serial);
      const serialIndex = await ensureSerialIndex(ctx, input.serial);

      const [legacyRows, complaintLinks, events, resolvedIndex] = await Promise.all([
        findSerialLegacyDispatchRows(ctx, normalizedSerial),
        ctx.prisma.serviceComplaintLine.findMany({
          where: {
            OR: [
              { normalizedSerial },
              { normalizedReplacementSerial: normalizedSerial },
            ],
          },
          include: {
            complaint: {
              select: {
                id: true,
                complaintNumber: true,
                status: true,
              },
            },
          },
        }),
        ctx.prisma.serviceSerialEvent.findMany({
          where: { normalizedSerial },
          orderBy: [{ eventAt: "desc" }, { id: "desc" }],
          take: 50,
        }),
        ctx.prisma.serviceSerialIndex.findUnique({
          where: { normalizedSerial },
          include: {
            product: {
              include: {
                category: {
                  include: {
                    brand: true,
                  },
                },
              },
            },
            soldOutlet: true,
          },
        }),
      ]);

      const chainMap = new Map<string, z.infer<typeof serialChainSchema>>();
      for (const row of legacyRows) {
        const key = `${row.orderLine.orderId}::${row.dispatchId}`;
        if (chainMap.has(key)) continue;
        chainMap.set(key, {
          orderId: row.orderLine.orderId,
          orderNumber: row.orderLine.order.orderNumber,
          dispatchId: row.dispatchId,
          dispatchDate: row.dispatch.dispatchDate.toISOString(),
          deliveryStatus: row.dispatch.deliveryStatus,
          invoiceId: row.orderLine.order.invoice?.id ?? null,
          invoiceNumber: row.orderLine.order.invoice?.invoiceNumber ?? null,
          outletId: row.orderLine.order.outlet?.id ?? null,
          outletName: row.orderLine.order.outlet?.name ?? null,
          outletCode: row.orderLine.order.outlet?.outletCode ?? null,
          warehouseId: row.dispatch.warehouseId,
        });
      }

      const mappedComplaintLinks = complaintLinks.map((line) => ({
        complaintId: line.complaint.id,
        complaintNumber: line.complaint.complaintNumber,
        complaintStatus: line.complaint.status,
        role:
          line.normalizedReplacementSerial === normalizedSerial
            ? ("replacement_serial" as const)
            : ("old_serial" as const),
        lineId: line.id,
      }));

      const replacementConflictIds = Array.from(
        new Set(
          complaintLinks
            .filter((line) => line.normalizedReplacementSerial === normalizedSerial)
            .map((line) => line.complaintId),
        ),
      );

      const fallbackProduct = legacyRows[0]?.product;
      const product = resolvedIndex?.product ?? null;

      return {
        serial: input.serial,
        normalizedSerial,
        product: product
          ? {
              id: product.id,
              name: product.name,
              sku: product.sku,
              categoryId: product.category?.id ?? null,
              categoryName: product.category?.name ?? null,
              brandName: product.category?.brand?.name ?? null,
            }
          : fallbackProduct
            ? {
                id: fallbackProduct.id,
                name: fallbackProduct.name,
                sku: fallbackProduct.sku,
                categoryId: fallbackProduct.category?.id ?? null,
                categoryName: fallbackProduct.category?.name ?? null,
                brandName: fallbackProduct.category?.brand?.name ?? null,
              }
            : null,
        soldToOutlet: resolvedIndex?.soldOutlet
          ? {
              id: resolvedIndex.soldOutlet.id,
              name: resolvedIndex.soldOutlet.name,
              outletCode: resolvedIndex.soldOutlet.outletCode,
            }
          : null,
        salesChain: Array.from(chainMap.values()),
        complaintLinks: mappedComplaintLinks,
        replacementConflict: {
          hasConflict: replacementConflictIds.length > 0,
          usedInComplaintIds: replacementConflictIds,
        },
        events: events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          eventAt: event.eventAt.toISOString(),
          createdAt: event.createdAt.toISOString(),
        })),
      };
    }),

  replacementEligibility: perm(P.service.read)
    .input(
      z.object({
        serial: z.string().min(2),
      }),
    )
    .output(
      z.object({
        serial: z.string(),
        normalizedSerial: z.string(),
        isEligible: z.boolean(),
        reasons: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      const normalizedSerial = normalizeSerial(input.serial);
      const linked = await ctx.prisma.serviceComplaintLine.findMany({
        where: { normalizedReplacementSerial: normalizedSerial },
        include: {
          complaint: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      const reasons: string[] = [];
      if (linked.length > 0) {
        reasons.push("Serial already assigned as replacement in service complaint flow");
      }

      return {
        serial: input.serial,
        normalizedSerial,
        isEligible: reasons.length === 0,
        reasons,
      };
    }),
});
