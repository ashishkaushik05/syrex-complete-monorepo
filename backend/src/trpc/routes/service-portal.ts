import { Prisma, type ServiceTestVerdict } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TrpcContext } from "../context";
import { createTRPCRouter, publicProcedure, servicePortalProcedure } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import {
  attachmentSchema,
  confirmPendingAttachment,
  createAttachmentDownload,
  createPendingAttachment,
  removeAttachment,
} from "./attachments";
import {
  createServiceComplaint,
  recordComplaintActivity,
  serviceComplaintCreateFieldsSchema,
} from "./service-shared";
import {
  hashServiceUserRefreshSecret,
  makeServiceUserRefreshToken,
  parseServiceUserRefreshToken,
  serviceUserRefreshExpiry,
  SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS,
  signServiceUserAccessToken,
  verifyServiceUserRefreshSecret,
} from "./service-portal-auth";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
type RateLimitBucket = { count: number; windowStart: number };
const registerRateLimit = new Map<string, RateLimitBucket>();
const loginRateLimit = new Map<string, RateLimitBucket>();
const refreshRateLimit = new Map<string, RateLimitBucket>();
const authenticatedRateLimit = new Map<string, RateLimitBucket>();

function enforceRateLimit(
  map: Map<string, RateLimitBucket>,
  key: string,
  max: number,
  now = Date.now(),
) {
  const normalized = key.trim().toLowerCase() || "unknown";
  const current = map.get(normalized);
  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    map.set(normalized, { count: 1, windowStart: now });
    return;
  }
  current.count += 1;
  if (current.count > max) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }
}

function requireDefaultOrgId() {
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) throw apiError("INTERNAL", "Service portal org context is not configured");
  return orgId;
}

const serviceUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().email(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

const tokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: serviceUserSchema,
});

function toServiceUser(user: {
  id: string;
  name: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueSession(
  prisma: Pick<TrpcContext["prisma"], "serviceUserSession">,
  user: {
    id: string;
    name: string;
    phone: string;
    email: string;
    isActive: boolean;
    createdAt: Date;
  },
) {
  const sessionId = crypto.randomUUID();
  const refresh = makeServiceUserRefreshToken(sessionId);
  await prisma.serviceUserSession.create({
    data: {
      id: sessionId,
      serviceUserId: user.id,
      refreshTokenHash: await hashServiceUserRefreshSecret(refresh.secret),
      expiresAt: serviceUserRefreshExpiry(),
    },
  });
  return {
    accessToken: await signServiceUserAccessToken({
      serviceUserId: user.id,
      sessionId,
    }),
    refreshToken: refresh.refreshToken,
    expiresIn: SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS,
    user: toServiceUser(user),
  };
}

const statusSchema = z.enum([
  "raised",
  "assigned",
  "visit",
  "test_result_submitted",
  "retest_requested",
  "resolved",
  "telephonic_closure",
  "cancelled",
]);

const portalListItemSchema = z.object({
  id: z.string(),
  complaintNumber: z.string(),
  status: statusSchema,
  issueCategory: z.string(),
  title: z.string().nullable(),
  customerName: z.string().nullable(),
  serialNumber: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const portalAttachmentSchema = attachmentSchema.pick({
  id: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  isConfirmed: true,
  createdAt: true,
});

const portalCatalogFacetSchema = z.object({
  name: z.string(),
  categories: z.array(z.string()),
});

const portalCatalogProductSchema = z.object({
  sku: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  brandName: z.string(),
  categoryName: z.string(),
  description: z.string().nullable(),
  warrantyMonths: z.number().int().min(0),
  primaryImageUrl: z.string().nullable(),
});

const portalCatalogInputSchema = paginationInputSchema.extend({
  q: z.string().trim().max(100).optional(),
  brandName: z.string().trim().min(1).max(200).optional(),
  categoryName: z.string().trim().min(1).max(200).optional(),
});

const portalDetailSchema = portalListItemSchema.extend({
  description: z.string().nullable(),
  customerPhone: z.string().nullable(),
  complainantType: z.enum(["self", "on_behalf_of"]),
  thirdPartyName: z.string().nullable(),
  thirdPartyPhone: z.string().nullable(),
  sku: z.string(),
  assignedEngineer: z
    .object({
      name: z.string(),
      roleLabel: z.string(),
    })
    .nullable(),
  latestTest: z
    .object({
      verdict: z.enum(["tested_ok", "warranty_candidate", "failed", "needs_retest"]),
      summary: z.string(),
      submittedAt: z.string(),
    })
    .nullable(),
  warranty: z
    .object({
      status: z.enum(["pending", "approved", "rejected"]),
      reason: z.string().nullable(),
      decidedAt: z.string().nullable(),
      replacement: z
        .object({
          type: z.enum(["order", "invoice"]),
          reference: z.string(),
          status: z.string(),
        })
        .nullable(),
    })
    .nullable(),
  timeline: z.array(
    z.object({
      action: z.string(),
      status: statusSchema.nullable(),
      createdAt: z.string(),
    }),
  ),
  attachments: z.array(portalAttachmentSchema),
  canEdit: z.boolean(),
  canCancel: z.boolean(),
});

const CUSTOMER_VISIBLE_ACTIONS = new Set([
  "raised",
  "assign",
  "reassign",
  "visit_logged",
  "test_submitted",
  "retest_requested",
  "warranty_approve",
  "warranty_reject",
  "replacement_order_created",
  "replacement_invoice_created",
  "telephonic_close",
  "tested_ok_close",
  "cancel",
  "reopen",
]);

function safeTestSummary(verdict: ServiceTestVerdict) {
  switch (verdict) {
    case "tested_ok":
      return "Testing is complete. No replacement is required.";
    case "warranty_candidate":
      return "Testing is complete. Your warranty claim is under review.";
    case "failed":
      return "Testing is complete. The unit is not eligible for warranty replacement.";
    case "needs_retest":
      return "Additional testing is required.";
  }
}

const PORTAL_DETAIL_INCLUDE = {
  lines: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], take: 1 },
  assignments: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    include: {
      seUser: { select: { name: true, role: { select: { name: true } } } },
      asiUser: { select: { name: true, role: { select: { name: true } } } },
    },
  },
  testReports: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
  activities: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  warrantyDecision: {
    include: {
      replacementOrder: { select: { orderNumber: true, status: true } },
      replacementInvoice: { select: { invoiceNumber: true } },
    },
  },
} satisfies Prisma.ServiceComplaintInclude;

type PortalDetailRow = Prisma.ServiceComplaintGetPayload<{
  include: typeof PORTAL_DETAIL_INCLUDE;
}>;

async function projectForServiceUser(
  prisma: TrpcContext["prisma"],
  row: PortalDetailRow,
) {
  const line = row.lines[0];
  if (!line) throw apiError("INTERNAL", "Complaint has no affected unit");
  const assignment = row.assignments[0];
  const assigned = assignment?.seUser ?? assignment?.asiUser ?? null;
  const test = row.testReports[0];
  const warranty = row.warrantyDecision;
  const attachments = await prisma.attachment.findMany({
    where: {
      entityType: "service_complaint",
      entityId: row.id,
      isConfirmed: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  let replacement: { type: "order" | "invoice"; reference: string; status: string } | null = null;
  if (warranty?.replacementOrder) {
    replacement = {
      type: "order",
      reference: warranty.replacementOrder.orderNumber,
      status: warranty.replacementOrder.status,
    };
  } else if (warranty?.replacementInvoice) {
    replacement = {
      type: "invoice",
      reference: warranty.replacementInvoice.invoiceNumber,
      status: "issued",
    };
  }

  return {
    id: row.id,
    complaintNumber: row.complaintNumber,
    status: row.status,
    issueCategory: row.issueCategory,
    title: row.title,
    description: row.description,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    complainantType: row.complainantType,
    thirdPartyName: row.thirdPartyName,
    thirdPartyPhone: row.thirdPartyPhone,
    sku: line.sku,
    serialNumber: line.serialNumber,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignedEngineer: assigned
      ? { name: assigned.name, roleLabel: assigned.role.name }
      : null,
    latestTest: test
      ? {
          verdict: test.verdict,
          summary: safeTestSummary(test.verdict),
          submittedAt: test.createdAt.toISOString(),
        }
      : null,
    warranty: warranty
      ? {
          status: warranty.status,
          reason: warranty.status === "rejected" ? warranty.rejectionReason : null,
          decidedAt: warranty.decidedAt?.toISOString() ?? null,
          replacement,
        }
      : null,
    timeline: row.activities
      .filter((activity) => CUSTOMER_VISIBLE_ACTIONS.has(activity.action))
      .map((activity) => ({
        action: activity.action,
        status: activity.toStatus,
        createdAt: activity.createdAt.toISOString(),
      })),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      isConfirmed: attachment.isConfirmed,
      createdAt: attachment.createdAt.toISOString(),
    })),
    canEdit: row.status === "raised",
    canCancel: row.status === "raised",
  };
}

async function findOwnedComplaint(
  prisma: TrpcContext["prisma"],
  serviceUserId: string,
  complaintId: string,
) {
  const row = await prisma.serviceComplaint.findFirst({
    where: {
      id: complaintId,
      raisedByServiceUserId: serviceUserId,
      orgId: requireDefaultOrgId(),
    },
    include: PORTAL_DETAIL_INCLUDE,
  });
  if (!row) throw apiError("NOT_FOUND", "Complaint not found");
  return row;
}

const imageUploadInputSchema = z.object({
  complaintId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  fileSize: z.number().int().positive().max(25 * 1024 * 1024),
});

export const servicePortalRouter = createTRPCRouter({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200),
        phone: z.string().trim().min(5).max(40),
        email: z.string().trim().email(),
        password: z.string().min(8).max(128),
      }),
    )
    .output(tokenSchema)
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit(registerRateLimit, ctx.sourceIp, 5);
      try {
        const passwordHash = await Bun.password.hash(input.password, {
          algorithm: "bcrypt",
          cost: 12,
        });
        return await ctx.prisma.$transaction(async (tx) => {
          const user = await tx.serviceUser.create({
            data: {
              name: input.name,
              phone: input.phone,
              email: input.email.toLowerCase(),
              passwordHash,
            },
          });
          return issueSession(tx, user);
        });
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === "P2002") {
          throw apiError("CONFLICT", "An account already exists with this email or phone");
        }
        throw error;
      }
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().trim().email(),
        password: z.string().min(1).max(128),
      }),
    )
    .output(tokenSchema)
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit(loginRateLimit, input.email, 10);
      const user = await ctx.prisma.serviceUser.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (!user?.isActive) throw apiError("UNAUTHORIZED", "Invalid credentials");
      const valid = await Bun.password.verify(input.password, user.passwordHash).catch(() => false);
      if (!valid) throw apiError("UNAUTHORIZED", "Invalid credentials");
      return issueSession(ctx.prisma, user);
    }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .output(tokenSchema)
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit(refreshRateLimit, ctx.sourceIp, 20);
      const parsed = parseServiceUserRefreshToken(input.refreshToken);
      if (!parsed) throw apiError("UNAUTHORIZED", "Invalid refresh token");
      const session = await ctx.prisma.serviceUserSession.findUnique({
        where: { id: parsed.sessionId },
        include: { serviceUser: true },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !session.serviceUser.isActive ||
        !(await verifyServiceUserRefreshSecret(parsed.secret, session.refreshTokenHash))
      ) {
        throw apiError("UNAUTHORIZED", "Invalid refresh token");
      }

      const rotated = makeServiceUserRefreshToken(session.id);
      await ctx.prisma.serviceUserSession.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: await hashServiceUserRefreshSecret(rotated.secret),
          expiresAt: serviceUserRefreshExpiry(),
        },
      });
      return {
        accessToken: await signServiceUserAccessToken({
          serviceUserId: session.serviceUserId,
          sessionId: session.id,
        }),
        refreshToken: rotated.refreshToken,
        expiresIn: SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS,
        user: toServiceUser(session.serviceUser),
      };
    }),

  logout: servicePortalProcedure.mutation(async ({ ctx }) => {
    enforceRateLimit(
      authenticatedRateLimit,
      `logout:${ctx.serviceUser!.id}:${ctx.sourceIp}`,
      30,
    );
    await ctx.prisma.serviceUserSession.updateMany({
      where: {
        id: ctx.serviceUser!.sessionId,
        serviceUserId: ctx.serviceUser!.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }),

  me: servicePortalProcedure.output(serviceUserSchema).query(async ({ ctx }) => {
    enforceRateLimit(
      authenticatedRateLimit,
      `me:${ctx.serviceUser!.id}:${ctx.sourceIp}`,
      120,
    );
    const user = await ctx.prisma.serviceUser.findUnique({
      where: { id: ctx.serviceUser!.id },
    });
    if (!user?.isActive) throw apiError("UNAUTHORIZED", "Service account is inactive");
    return toServiceUser(user);
  }),

  listCatalogFacets: servicePortalProcedure
    .output(z.array(portalCatalogFacetSchema))
    .query(async ({ ctx }) => {
      const brands = await ctx.prisma.brand.findMany({
        where: {
          isActive: true,
          categories: {
            some: {
              isActive: true,
              products: { some: { isActive: true } },
            },
          },
        },
        select: {
          name: true,
          categories: {
            where: {
              isActive: true,
              products: { some: { isActive: true } },
            },
            select: { name: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: { name: "asc" },
      });
      return brands.map((brand) => ({
        name: brand.name,
        categories: brand.categories.map((category) => category.name),
      }));
    }),

  listCatalogProducts: servicePortalProcedure
    .input(portalCatalogInputSchema)
    .output(z.object({
      items: z.array(portalCatalogProductSchema),
      nextCursor: z.string().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      const cursor = decodeCursor(input.cursor);
      const q = input.q?.trim();
      const rows = await ctx.prisma.product.findMany({
        where: {
          isActive: true,
          category: {
            isActive: true,
            ...(input.categoryName ? { name: input.categoryName } : {}),
            brand: {
              isActive: true,
              ...(input.brandName ? { name: input.brandName } : {}),
            },
          },
          AND: [
            ...(q
              ? [{
                  OR: [
                    { name: { contains: q, mode: "insensitive" as const } },
                    { displayName: { contains: q, mode: "insensitive" as const } },
                    { sku: { contains: q, mode: "insensitive" as const } },
                  ],
                }]
              : []),
            ...(cursor
              ? [{
                  OR: [
                    { createdAt: { lt: new Date(cursor.ts) } },
                    { createdAt: new Date(cursor.ts), id: { lt: cursor.id } },
                  ],
                }]
              : []),
          ],
        },
        select: {
          id: true,
          sku: true,
          name: true,
          displayName: true,
          description: true,
          warrantyMonths: true,
          createdAt: true,
          category: {
            select: {
              name: true,
              brand: { select: { name: true } },
            },
          },
          images: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { uri: true },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: page.map((product) => ({
          sku: product.sku,
          name: product.name,
          displayName: product.displayName,
          brandName: product.category.brand.name,
          categoryName: product.category.name,
          description: product.description,
          warrantyMonths: product.warrantyMonths,
          primaryImageUrl: product.images[0]?.uri ?? null,
        })),
        nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
      };
    }),

  createComplaint: servicePortalProcedure
    .input(serviceComplaintCreateFieldsSchema)
    .output(portalDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const id = await createServiceComplaint(ctx.prisma, {
        ...input,
        orgId: requireDefaultOrgId(),
        serviceUserId: ctx.serviceUser!.id,
      });
      return projectForServiceUser(
        ctx.prisma,
        await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, id),
      );
    }),

  listMyComplaints: servicePortalProcedure
    .input(paginationInputSchema)
    .output(z.object({ items: z.array(portalListItemSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const cursor = decodeCursor(input.cursor);
      const rows = await ctx.prisma.serviceComplaint.findMany({
        where: {
          raisedByServiceUserId: ctx.serviceUser!.id,
          orgId: requireDefaultOrgId(),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: new Date(cursor.ts) } },
                  { createdAt: new Date(cursor.ts), id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        include: { lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1 } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: items.map((row) => ({
          id: row.id,
          complaintNumber: row.complaintNumber,
          status: row.status,
          issueCategory: row.issueCategory,
          title: row.title,
          customerName: row.customerName,
          serialNumber: row.lines[0]?.serialNumber ?? "",
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
        nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null,
      };
    }),

  getMyComplaint: servicePortalProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(portalDetailSchema)
    .query(async ({ ctx, input }) =>
      projectForServiceUser(
        ctx.prisma,
        await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.id),
      ),
    ),

  updateMyComplaint: servicePortalProcedure
    .input(z.object({ id: z.string().uuid(), description: z.string().trim().min(1).max(4000) }))
    .output(portalDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.serviceComplaint.updateMany({
        where: {
          id: input.id,
          raisedByServiceUserId: ctx.serviceUser!.id,
          orgId: requireDefaultOrgId(),
          status: "raised",
        },
        data: { description: input.description },
      });
      if (result.count === 0) {
        await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.id);
        throw apiError("CONFLICT", "Only submitted complaints can be edited");
      }
      return projectForServiceUser(
        ctx.prisma,
        await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.id),
      );
    }),

  cancelMyComplaint: servicePortalProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(portalDetailSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        const now = new Date();
        const result = await tx.serviceComplaint.updateMany({
          where: {
            id: input.id,
            raisedByServiceUserId: ctx.serviceUser!.id,
            orgId: requireDefaultOrgId(),
            status: "raised",
          },
          data: { status: "cancelled", cancelledAt: now, closedAt: now },
        });
        if (result.count === 0) {
          const owned = await tx.serviceComplaint.findFirst({
            where: {
              id: input.id,
              raisedByServiceUserId: ctx.serviceUser!.id,
              orgId: requireDefaultOrgId(),
            },
            select: { id: true },
          });
          if (!owned) throw apiError("NOT_FOUND", "Complaint not found");
          throw apiError("CONFLICT", "Only submitted complaints can be cancelled");
        }
        await recordComplaintActivity(tx, {
          complaintId: input.id,
          action: "cancel",
          fromStatus: "raised",
          toStatus: "cancelled",
        });
      });
      return projectForServiceUser(
        ctx.prisma,
        await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.id),
      );
    }),

  listComplaintAttachments: servicePortalProcedure
    .input(z.object({ complaintId: z.string().uuid() }))
    .output(z.array(portalAttachmentSchema))
    .query(async ({ ctx, input }) => {
      await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.complaintId);
      const rows = await ctx.prisma.attachment.findMany({
        where: {
          entityType: "service_complaint",
          entityId: input.complaintId,
          isConfirmed: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        fileSize: row.fileSize,
        isConfirmed: row.isConfirmed,
        createdAt: row.createdAt.toISOString(),
      }));
    }),

  createComplaintAttachment: servicePortalProcedure
    .input(imageUploadInputSchema)
    .output(
      z.object({
        attachment: portalAttachmentSchema,
        upload: z.object({
          method: z.literal("PUT"),
          uploadUrl: z.string().url(),
          expiresAt: z.string(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.complaintId);
      return createPendingAttachment(
        ctx,
        {
          entityType: "service_complaint",
          entityId: input.complaintId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          expiresInMinutes: 15,
        },
        { uploadedByServiceUserId: ctx.serviceUser!.id },
      );
    }),

  confirmComplaintAttachment: servicePortalProcedure
    .input(z.object({ complaintId: z.string().uuid(), attachmentId: z.string().uuid() }))
    .output(portalAttachmentSchema)
    .mutation(async ({ ctx, input }) => {
      await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.complaintId);
      const attachment = await ctx.prisma.attachment.findFirst({
        where: {
          id: input.attachmentId,
          entityType: "service_complaint",
          entityId: input.complaintId,
        },
        select: { id: true },
      });
      if (!attachment) throw apiError("NOT_FOUND", "Attachment not found");
      return confirmPendingAttachment(ctx, input.attachmentId, {
        uploadedByServiceUserId: ctx.serviceUser!.id,
      });
    }),

  getComplaintAttachmentDownload: servicePortalProcedure
    .input(z.object({ complaintId: z.string().uuid(), attachmentId: z.string().uuid() }))
    .output(z.object({ downloadUrl: z.string().url(), expiresIn: z.number().int() }))
    .query(async ({ ctx, input }) => {
      await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.complaintId);
      const attachment = await ctx.prisma.attachment.findFirst({
        where: {
          id: input.attachmentId,
          entityType: "service_complaint",
          entityId: input.complaintId,
          isConfirmed: true,
        },
        select: { id: true },
      });
      if (!attachment) throw apiError("NOT_FOUND", "Attachment not found");
      return createAttachmentDownload(ctx, input.attachmentId);
    }),

  removeComplaintAttachment: servicePortalProcedure
    .input(z.object({ complaintId: z.string().uuid(), attachmentId: z.string().uuid() }))
    .output(z.object({ id: z.string(), deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await findOwnedComplaint(ctx.prisma, ctx.serviceUser!.id, input.complaintId);
      const attachment = await ctx.prisma.attachment.findFirst({
        where: {
          id: input.attachmentId,
          entityType: "service_complaint",
          entityId: input.complaintId,
        },
        select: { id: true },
      });
      if (!attachment) throw apiError("NOT_FOUND", "Attachment not found");
      return removeAttachment(ctx, input.attachmentId, {
        uploadedByServiceUserId: ctx.serviceUser!.id,
      });
    }),
});

export const __servicePortalTestUtils = {
  resetRateLimits() {
    registerRateLimit.clear();
    loginRateLimit.clear();
    refreshRateLimit.clear();
    authenticatedRateLimit.clear();
  },
};
