import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import type { TrpcContext } from "../context";

const attachmentEntityTypeSchema = z.enum([
  "order",
  "dispatch",
  "invoice",
  "payment",
  "brand",
  "category",
  "sku"
]);

const attachmentSchema = z.object({
  id: z.string(),
  entityType: attachmentEntityTypeSchema,
  entityId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  storageKey: z.string(),
  uploadedById: z.string(),
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
  uploadedById: string;
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

  const row = await ctx.prisma.outletPayment.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!row) {
    throw apiError("BAD_REQUEST", "Invalid payment entityId");
  }
}

export const attachmentsRouter = createTRPCRouter({
  list: perm(P.attachments.read)
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
      const offset = decodeCursor(input.cursor) ?? 0;
      const rows = await ctx.prisma.attachment.findMany({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
          isConfirmed: input.isConfirmed
        },
        include: { pendingUpload: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });

      const hasMore = rows.length > input.limit;
      const pageItems = hasMore ? rows.slice(0, input.limit) : rows;

      return {
        items: pageItems.map(toAttachment),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm(P.attachments.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(attachmentSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.prisma.attachment.findUnique({
        where: { id: input.id },
        include: { pendingUpload: true }
      });
      if (!row) {
        throw apiError("NOT_FOUND", "Attachment not found");
      }
      return toAttachment(row);
    }),

  createPending: perm(P.attachments.write)
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
      await assertEntityExists(ctx, input.entityType, input.entityId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + input.expiresInMinutes * 60 * 1000);
      const safeFile = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storageKey = `attachments/${input.entityType}/${input.entityId}/${Date.now()}-${safeFile}`;

      const row = await ctx.prisma.attachment.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          storageKey,
          uploadedById: ctx.actor.id,
          isConfirmed: false,
          pendingUpload: {
            create: {
              expiresAt
            }
          }
        },
        include: {
          pendingUpload: true
        }
      });

      return {
        attachment: toAttachment(row),
        upload: {
          method: "PUT",
          uploadUrl: `https://uploads.local/${encodeURIComponent(storageKey)}?expiresAt=${encodeURIComponent(expiresAt.toISOString())}`,
          storageKey,
          expiresAt: expiresAt.toISOString()
        }
      };
    }),

  confirm: perm(P.attachments.write)
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
      const row = await ctx.prisma.attachment.findUnique({
        where: { id: input.attachmentId },
        include: { pendingUpload: true }
      });

      if (!row) {
        throw apiError("NOT_FOUND", "Attachment not found");
      }
      if (row.isConfirmed) {
        return toAttachment(row);
      }
      if (!row.pendingUpload) {
        throw apiError("CONFLICT", "Pending upload session not found");
      }
      if (row.pendingUpload.expiresAt.getTime() < Date.now()) {
        throw apiError("CONFLICT", "Pending upload session expired");
      }
      if (row.uploadedById !== ctx.actor.id) {
        throw apiError("FORBIDDEN", "Only uploader can confirm pending upload");
      }

      const updated = await ctx.prisma.attachment.update({
        where: { id: row.id },
        data: {
          isConfirmed: true,
          pendingUpload: {
            delete: true
          }
        },
        include: {
          pendingUpload: true
        }
      });

      return toAttachment(updated);
    }),

  remove: perm(P.attachments.delete)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string(), deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.actor.id) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      const existing = await ctx.prisma.attachment.findUnique({
        where: { id: input.id },
        select: { id: true, uploadedById: true }
      });
      if (!existing) {
        throw apiError("NOT_FOUND", "Attachment not found");
      }
      if (existing.uploadedById !== ctx.actor.id) {
        throw apiError("FORBIDDEN", "Only uploader can delete attachment");
      }

      await ctx.prisma.attachment.delete({ where: { id: input.id } });
      return { id: input.id, deleted: true };
    })
});
