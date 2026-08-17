import { z } from "zod";
import { createTRPCRouter, internalPerm, internalPermAny } from "../trpc";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import type { TrpcContext } from "../context";
import {
  createDownloadUrl,
  createUploadUrl,
  deleteStoredObject,
  verifyUploadedObject,
} from "../../infra/object-storage";
import {
  assertServiceComplaintAccess,
  complaintIdForServiceEntity,
  isServiceEntityType,
} from "./service-access";
import {
  actorHasInternalSalesOutletAccess,
  assertOutletWarehouseScope,
  resolveFinancialScope,
} from "./outlet-access";

const attachmentEntityTypeSchema = z.enum([
  "order",
  "dispatch",
  "invoice",
  "payment",
  "brand",
  "category",
  "sku",
  "service_complaint",
  "service_test",
  "service_form_submission",
  "warranty_decision",
]);

export const attachmentSchema = z.object({
  id: z.string(),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  storageKey: z.string(),
  uploadedById: z.string().nullable(),
  uploadedByServiceUserId: z.string().nullable(),
  isConfirmed: z.boolean(),
  createdAt: z.string(),
  pendingUpload: z
    .object({
      id: z.string(),
      expiresAt: z.string(),
      createdAt: z.string()
    })
    .nullable()
});

function toAttachment(row: {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  uploadedById: string | null;
  uploadedByServiceUserId: string | null;
  isConfirmed: boolean;
  createdAt: Date;
  pendingUpload?: {
    id: string;
    expiresAt: Date;
    createdAt: Date;
  } | null;
}) {
  return {
    id: row.id,
    entityType: attachmentEntityTypeSchema.parse(row.entityType),
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
          createdAt: row.pendingUpload.createdAt.toISOString()
        }
      : null
  };
}

async function assertEntityExists(
  ctx: TrpcContext,
  entityType: z.infer<typeof attachmentEntityTypeSchema>,
  entityId: string
) {
  if (entityType === "order") {
    const row = await ctx.prisma.saleOrder.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid order entityId");
    }
    return;
  }

  if (entityType === "dispatch") {
    const row = await ctx.prisma.dispatch.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid dispatch entityId");
    }
    return;
  }

  if (entityType === "invoice") {
    const row = await ctx.prisma.invoice.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid invoice entityId");
    }
    return;
  }

  if (entityType === "brand") {
    const row = await ctx.prisma.brand.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid brand entityId");
    }
    return;
  }

  if (entityType === "category") {
    const row = await ctx.prisma.category.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid category entityId");
    }
    return;
  }

  if (entityType === "sku") {
    const row = await ctx.prisma.product.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid sku entityId");
    }
    return;
  }

  if (entityType === "service_complaint") {
    const row = await ctx.prisma.serviceComplaint.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid service complaint entityId");
    }
    return;
  }

  if (entityType === "service_test") {
    const row = await ctx.prisma.serviceTestReport.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid service test entityId");
    }
    return;
  }

  if (entityType === "service_form_submission") {
    const row = await ctx.prisma.serviceFormSubmission.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid service form submission entityId");
    }
    return;
  }

  if (entityType === "warranty_decision") {
    const row = await ctx.prisma.serviceWarrantyDecision.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) {
      throw apiError("BAD_REQUEST", "Invalid warranty decision entityId");
    }
    return;
  }

  const row = await ctx.prisma.outletPayment.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!row) {
    throw apiError("BAD_REQUEST", "Invalid payment entityId");
  }
}

type AttachmentUploader =
  | { uploadedById: string; uploadedByServiceUserId?: never }
  | { uploadedById?: never; uploadedByServiceUserId: string };

function assertSingleUploader(uploader: AttachmentUploader) {
  const internalId = "uploadedById" in uploader ? uploader.uploadedById : undefined;
  const serviceUserId =
    "uploadedByServiceUserId" in uploader ? uploader.uploadedByServiceUserId : undefined;
  if (Boolean(internalId) === Boolean(serviceUserId)) {
    throw apiError("BAD_REQUEST", "Attachment must have exactly one uploader");
  }
}

function isUploader(
  row: { uploadedById: string | null; uploadedByServiceUserId: string | null },
  uploader: AttachmentUploader,
) {
  assertSingleUploader(uploader);
  return "uploadedById" in uploader
    ? row.uploadedById === uploader.uploadedById
    : row.uploadedByServiceUserId === uploader.uploadedByServiceUserId;
}

export async function createPendingAttachment(
  ctx: TrpcContext,
  input: {
    entityType: z.infer<typeof attachmentEntityTypeSchema>;
    entityId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    expiresInMinutes: number;
  },
  uploader: AttachmentUploader,
) {
  assertSingleUploader(uploader);
  await assertEntityExists(ctx, input.entityType, input.entityId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInMinutes * 60 * 1000);
  const safeFile = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageKey = `attachments/${input.entityType}/${input.entityId}/${crypto.randomUUID()}-${safeFile}`;
  let uploadUrl: string;
  try {
    uploadUrl = await createUploadUrl({
      storageKey,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      expiresInSeconds: input.expiresInMinutes * 60,
    });
  } catch {
    throw apiError("INTERNAL", "Attachment storage is unavailable");
  }

  const row = await ctx.prisma.attachment.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      storageKey,
      uploadedById: "uploadedById" in uploader ? uploader.uploadedById : null,
      uploadedByServiceUserId:
        "uploadedByServiceUserId" in uploader ? uploader.uploadedByServiceUserId : null,
      isConfirmed: false,
      pendingUpload: { create: { expiresAt } },
    },
    include: { pendingUpload: true },
  });

  return {
    attachment: toAttachment(row),
    upload: {
      method: "PUT" as const,
      uploadUrl,
      storageKey,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function confirmPendingAttachment(
  ctx: TrpcContext,
  attachmentId: string,
  uploader: AttachmentUploader,
) {
  const row = await ctx.prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { pendingUpload: true },
  });
  if (!row) throw apiError("NOT_FOUND", "Attachment not found");
  if (!isUploader(row, uploader)) throw apiError("FORBIDDEN", "Only uploader can confirm pending upload");
  if (row.isConfirmed) return toAttachment(row);
  if (!row.pendingUpload) throw apiError("CONFLICT", "Pending upload session not found");
  if (row.pendingUpload.expiresAt.getTime() < Date.now()) {
    throw apiError("CONFLICT", "Pending upload session expired");
  }

  let objectMatches = false;
  try {
    objectMatches = await verifyUploadedObject({
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
    });
  } catch {
    throw apiError("CONFLICT", "Uploaded object was not found");
  }
  if (!objectMatches) {
    throw apiError("CONFLICT", "Uploaded object does not match the declared file");
  }

  const updated = await ctx.prisma.attachment.update({
    where: { id: row.id },
    data: { isConfirmed: true, pendingUpload: { delete: true } },
    include: { pendingUpload: true },
  });
  return toAttachment(updated);
}

export async function createAttachmentDownload(
  ctx: TrpcContext,
  attachmentId: string,
) {
  const row = await ctx.prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { pendingUpload: true },
  });
  if (!row || !row.isConfirmed) throw apiError("NOT_FOUND", "Attachment not found");
  try {
    return {
      attachment: toAttachment(row),
      downloadUrl: await createDownloadUrl(row.storageKey),
      expiresIn: 300,
    };
  } catch {
    throw apiError("INTERNAL", "Attachment storage is unavailable");
  }
}

export async function removeAttachment(
  ctx: TrpcContext,
  attachmentId: string,
  uploader: AttachmentUploader,
) {
  const existing = await ctx.prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      entityType: true,
      storageKey: true,
      uploadedById: true,
      uploadedByServiceUserId: true,
    },
  });
  if (!existing) throw apiError("NOT_FOUND", "Attachment not found");
  if (!isUploader(existing, uploader)) throw apiError("FORBIDDEN", "Only uploader can delete attachment");
  if (existing.entityType === "service_form_submission") {
    throw apiError("CONFLICT", "Evidence committed to a form submission cannot be removed");
  }
  try {
    await deleteStoredObject(existing.storageKey);
  } catch {
    throw apiError("INTERNAL", "Attachment storage is unavailable");
  }
  await ctx.prisma.$transaction(async (tx) => {
    await tx.pendingUpload.deleteMany({ where: { attachmentId: existing.id } });
    await tx.attachment.delete({ where: { id: existing.id } });
  });
  return { id: existing.id, deleted: true };
}

function assertDomainReadPermission(ctx: TrpcContext, permission: string) {
  if (
    !ctx.permissions.includes(SUPER_ADMIN_PERMISSION) &&
    !ctx.permissions.includes(permission)
  ) {
    throw apiError("FORBIDDEN", `Requires: ${permission}`);
  }
}

function denyAttachmentTarget(): never {
  throw apiError("NOT_FOUND", "Attachment target not found");
}

async function assertInternalServiceEntityAccess(
  ctx: TrpcContext,
  entityType: Parameters<typeof complaintIdForServiceEntity>[1],
  entityId: string,
) {
  if (!isServiceEntityType(entityType)) denyAttachmentTarget();
  assertDomainReadPermission(ctx, P.service.read);
  const complaintId = await complaintIdForServiceEntity(ctx, entityType, entityId);
  if (!complaintId || !ctx.actor.orgId) denyAttachmentTarget();
  await assertServiceComplaintAccess(ctx, complaintId, ctx.actor.orgId);
}

async function assertInternalOrderAttachmentAccess(ctx: TrpcContext, entityId: string) {
  assertDomainReadPermission(ctx, P.orders.read);
  const order = await ctx.prisma.saleOrder.findUnique({
    where: { id: entityId },
    select: { outletId: true },
  });
  if (!order) denyAttachmentTarget();

  if (
    ctx.permissions.includes(SUPER_ADMIN_PERMISSION) ||
    actorHasInternalSalesOutletAccess(ctx)
  ) {
    return;
  }
  if (ctx.linkedOutletId === order.outletId) return;
  if (ctx.managedWarehouseId) {
    await assertOutletWarehouseScope(ctx, order.outletId);
    return;
  }
  denyAttachmentTarget();
}

async function assertInternalDispatchAttachmentAccess(ctx: TrpcContext, entityId: string) {
  assertDomainReadPermission(ctx, P.dispatches.read);
  const dispatch = await ctx.prisma.dispatch.findUnique({
    where: { id: entityId },
    select: { warehouseId: true },
  });
  if (!dispatch) denyAttachmentTarget();

  if (
    ctx.permissions.includes(SUPER_ADMIN_PERMISSION) ||
    actorHasInternalSalesOutletAccess(ctx)
  ) {
    return;
  }
  if (ctx.managedWarehouseId === dispatch.warehouseId) return;
  denyAttachmentTarget();
}

async function assertInternalFinancialAttachmentAccess(
  ctx: TrpcContext,
  entityType: "invoice" | "payment",
  entityId: string,
) {
  const permission = entityType === "invoice" ? P.invoices.read : P.payments.read;
  assertDomainReadPermission(ctx, permission);
  const row = entityType === "invoice"
    ? await ctx.prisma.invoice.findUnique({ where: { id: entityId }, select: { outletId: true } })
    : await ctx.prisma.outletPayment.findUnique({ where: { id: entityId }, select: { outletId: true } });
  if (!row) denyAttachmentTarget();

  const scope = resolveFinancialScope(ctx, {
    includeInternalSales: entityType === "invoice",
    errorMessage: "No safe attachment financial scope available",
  });
  if (scope.hasGlobalAccess) return;
  if (scope.linkedOutletId === row.outletId) return;
  if (scope.isWarehouseScoped) {
    await assertOutletWarehouseScope(ctx, row.outletId);
    return;
  }
  denyAttachmentTarget();
}

async function assertInternalCatalogAttachmentAccess(
  ctx: TrpcContext,
  entityType: "brand" | "category" | "sku",
  entityId: string,
) {
  assertDomainReadPermission(ctx, P.catalog.read);
  const row = entityType === "brand"
    ? await ctx.prisma.brand.findUnique({ where: { id: entityId }, select: { id: true } })
    : entityType === "category"
      ? await ctx.prisma.category.findUnique({ where: { id: entityId }, select: { id: true } })
      : await ctx.prisma.product.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!row) denyAttachmentTarget();
}

export async function assertInternalAttachmentTargetAccess(
  ctx: TrpcContext,
  entityType: z.infer<typeof attachmentEntityTypeSchema>,
  entityId: string,
) {
  if (isServiceEntityType(entityType)) {
    await assertInternalServiceEntityAccess(ctx, entityType, entityId);
    return;
  }
  if (entityType === "order") {
    await assertInternalOrderAttachmentAccess(ctx, entityId);
    return;
  }
  if (entityType === "dispatch") {
    await assertInternalDispatchAttachmentAccess(ctx, entityId);
    return;
  }
  if (entityType === "invoice" || entityType === "payment") {
    await assertInternalFinancialAttachmentAccess(ctx, entityType, entityId);
    return;
  }
  await assertInternalCatalogAttachmentAccess(ctx, entityType, entityId);
}

async function assertInternalAttachmentAccess(ctx: TrpcContext, attachmentId: string) {
  const attachment = await ctx.prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { entityType: true, entityId: true },
  });
  if (!attachment) throw apiError("NOT_FOUND", "Attachment not found");
  const entityType = attachmentEntityTypeSchema.safeParse(attachment.entityType);
  if (!entityType.success) throw apiError("NOT_FOUND", "Attachment not found");
  await assertInternalAttachmentTargetAccess(ctx, entityType.data, attachment.entityId);
}

export const attachmentsRouter = createTRPCRouter({
  list: internalPerm(P.attachments.read)
    .input(
      paginationInputSchema.extend({
        entityType: attachmentEntityTypeSchema.optional(),
        entityId: z.string().uuid().optional(),
        isConfirmed: z.boolean().optional()
      })
    )
    .output(
      z.object({
        items: z.array(attachmentSchema),
        nextCursor: z.string().nullable()
      })
    )
    .query(async ({ ctx, input }) => {
      if (!input.entityType || !input.entityId) {
        throw apiError("BAD_REQUEST", "entityType and entityId are required for attachment listing");
      }
      await assertInternalAttachmentTargetAccess(ctx, input.entityType, input.entityId);
      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.attachment.findMany({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
          isConfirmed: input.isConfirmed,
          ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.ts) } }, { createdAt: new Date(cursor.ts), id: { lt: cursor.id } }] } : {}),
        },
        include: { pendingUpload: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items: pageItems.map(toAttachment),
        nextCursor: hasMore ? encodeCursor(pageItems[pageItems.length - 1]) : null
      };
    }),

  getById: internalPerm(P.attachments.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(attachmentSchema)
    .query(async ({ ctx, input }) => {
      await assertInternalAttachmentAccess(ctx, input.id);
      const row = await ctx.prisma.attachment.findUnique({
        where: { id: input.id },
        include: { pendingUpload: true }
      });
      if (!row) {
        throw apiError("NOT_FOUND", "Attachment not found");
      }
      return toAttachment(row);
    }),

  createPending: internalPerm(P.attachments.write)
    .input(
      z.object({
        entityType: attachmentEntityTypeSchema,
        entityId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(255),
        fileSize: z.number().int().positive().max(25 * 1024 * 1024),
        expiresInMinutes: z.number().int().min(1).max(60).default(15)
      })
    )
    .output(
      z.object({
        attachment: attachmentSchema,
        upload: z.object({
          method: z.literal("PUT"),
          uploadUrl: z.string().url(),
          storageKey: z.string(),
          expiresAt: z.string()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      await assertInternalAttachmentTargetAccess(ctx, input.entityType, input.entityId);
      return createPendingAttachment(ctx, input, { uploadedById: ctx.actor.id });
    }),

  confirm: internalPerm(P.attachments.write)
    .input(
      z.object({
        attachmentId: z.string().uuid()
      })
    )
    .output(attachmentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      await assertInternalAttachmentAccess(ctx, input.attachmentId);
      return confirmPendingAttachment(ctx, input.attachmentId, { uploadedById: ctx.actor.id });
    }),

  download: internalPerm(P.attachments.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(
      z.object({
        attachment: attachmentSchema,
        downloadUrl: z.string().url(),
        expiresIn: z.number().int(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertInternalAttachmentAccess(ctx, input.id);
      return createAttachmentDownload(ctx, input.id);
    }),

  remove: internalPermAny(P.attachments.write, P.attachments.delete)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string(), deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      await assertInternalAttachmentAccess(ctx, input.id);
      return removeAttachment(ctx, input.id, { uploadedById: ctx.actor.id });
    })
});
