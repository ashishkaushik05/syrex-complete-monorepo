import { z } from "zod";
import { createTRPCRouter, internalPerm, serviceScopedProcedure } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor } from "./_shared";
// Batch 04: refuse null actor orgId rather than silently widening filters.
function requireOrgId(actorOrgId: string | null): string {
  if (!actorOrgId) {
    throw apiError("FORBIDDEN", "Org context required");
  }
  return actorOrgId;
}

// SI-014: Only these scopes are valid for machine clients
const ALLOWED_MACHINE_SCOPES = ["service.read", "service.write", "service.form"] as const;

const clientMetaSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  status: z.enum(["active", "revoked"]),
  secretLast4: z.string(),
  expiresAt: z.string().nullable(),
  rotatedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

function toClientMeta(row: {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  status: "active" | "revoked";
  secretLast4: string;
  expiresAt: Date | null;
  rotatedAt: Date;
  lastUsedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    scopes: row.scopes,
    status: row.status,
    secretLast4: row.secretLast4,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    rotatedAt: row.rotatedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const serviceIntegrationsRouter = createTRPCRouter({
  listClients: internalPerm(P.service.manage)
    .input(
      z.object({
        status: z.enum(["active", "revoked"]).optional(),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .output(z.object({ items: z.array(clientMetaSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const parsed = decodeCursor(input.cursor);
      const rows = await ctx.prisma.serviceMachineClient.findMany({
        where: {
          orgId,
          ...(input.status ? { status: input.status } : {}),
          ...(parsed ? { OR: [{ createdAt: { lt: new Date(parsed.ts) } }, { createdAt: new Date(parsed.ts), id: { lt: parsed.id } }] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;
      return { items: items.map(toClientMeta), nextCursor };
    }),

  getClient: internalPerm(P.service.manage)
    .input(z.object({ clientId: z.string().regex(/^svc_[0-9a-f]{32}$/, "Invalid client ID format") }))
    .output(clientMetaSchema)
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const row = await ctx.prisma.serviceMachineClient.findFirst({
        where: { clientId: input.clientId, orgId },
      });
      if (!row) throw apiError("NOT_FOUND", "Client not found");
      return toClientMeta(row);
    }),

  updateClient: internalPerm(P.service.manage)
    .input(
      z.object({
        clientId: z.string().regex(/^svc_[0-9a-f]{32}$/, "Invalid client ID format"),
        name: z.string().min(2).max(120).optional(),
        scopes: z.array(z.enum(ALLOWED_MACHINE_SCOPES)).min(1).optional(),
      }),
    )
    .output(clientMetaSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);
      const existing = await ctx.prisma.serviceMachineClient.findFirst({
        where: { clientId: input.clientId, orgId },
      });
      if (!existing) throw apiError("NOT_FOUND", "Client not found");
      if (existing.status === "revoked") throw apiError("CONFLICT", "Cannot update a revoked client");

      const updated = await ctx.prisma.$transaction(async (tx) => {
        const client = await tx.serviceMachineClient.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            scopes: input.scopes,
          },
        });
        await tx.serviceMachineClientAudit.create({
          data: {
            serviceClientId: existing.id,
            action: "updated",
            actorId,
            meta: { changes: { name: input.name, scopes: input.scopes } },
          },
        });
        return client;
      });
      return toClientMeta(updated);
    }),

  listAuditLogs: internalPerm(P.service.manage)
    .input(
      z.object({
        clientId: z.string().regex(/^svc_[0-9a-f]{32}$/, "Invalid client ID format"),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            action: z.string(),
            actorId: z.string().nullable(),
            meta: z.unknown(),
            createdAt: z.string(),
          }),
        ),
        nextCursor: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const client = await ctx.prisma.serviceMachineClient.findFirst({
        where: { clientId: input.clientId, orgId },
        select: { id: true },
      });
      if (!client) throw apiError("NOT_FOUND", "Client not found");

      const parsed = decodeCursor(input.cursor);
      const rows = await ctx.prisma.serviceMachineClientAudit.findMany({
        where: {
          serviceClientId: client.id,
          ...(parsed ? { OR: [{ createdAt: { lt: new Date(parsed.ts) } }, { createdAt: new Date(parsed.ts), id: { lt: parsed.id } }] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;
      return {
        items: items.map((r) => ({
          id: r.id,
          action: r.action,
          actorId: r.actorId,
          meta: r.meta,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    }),

  createClient: internalPerm(P.service.manage)
    .input(
      z.object({
        name: z.string().min(2).max(120),
        scopes: z.array(z.enum(ALLOWED_MACHINE_SCOPES)).min(1, "At least one scope required"),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .output(
      z.object({
        client: clientMetaSchema,
        secret: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      // M-09: refuse past expiresAt at creation time (auth-time guard exists in trpc.ts).
      if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
        throw apiError("BAD_REQUEST", "expiresAt must be in the future");
      }

      const clientId = `svc_${crypto.randomUUID().replace(/-/g, "")}`;
      const secret = `sk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
      const secretHash = await Bun.password.hash(secret, { algorithm: "bcrypt", cost: 12 });
      const secretLast4 = secret.slice(-4);

      const created = await ctx.prisma.serviceMachineClient.create({
        data: {
          clientId,
          orgId,
          name: input.name,
          scopes: input.scopes,
          secretHash,
          secretLast4,
          createdById: actorId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          auditLogs: {
            create: {
              action: "created",
              actorId,
              meta: {
                scopes: input.scopes,
              },
            },
          },
        },
      });

      return {
        client: toClientMeta(created),
        secret,
      };
    }),

  rotateSecret: internalPerm(P.service.manage)
    .input(
      z.object({
        clientId: z.string().regex(/^svc_[0-9a-f]{32}$/, "Invalid client ID format"),
      }),
    )
    .output(
      z.object({
        client: clientMetaSchema,
        secret: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      const orgId = requireOrgId(ctx.actor.orgId);
      // SI-007: atomic findFirst + update inside a transaction to prevent TOCTOU race.
      // Org filter in the where clause guarantees cross-org NOT_FOUND (no info leak).
      const { client: updated, newSecret } = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.serviceMachineClient.findFirst({
          where: { clientId: input.clientId, orgId },
        });
        if (!existing) throw apiError("NOT_FOUND", "Client not found");
        if (existing.status !== "active") throw apiError("CONFLICT", "Cannot rotate secret for inactive client");

        const newSecret = `sk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
        const secretHash = await Bun.password.hash(newSecret, { algorithm: "bcrypt", cost: 12 });

        const client = await tx.serviceMachineClient.update({
          where: { clientId: input.clientId },
          data: {
            secretHash,
            secretLast4: newSecret.slice(-4),
            rotatedAt: new Date(),
          },
        });

        await tx.serviceMachineClientAudit.create({
          data: {
            serviceClientId: existing.id,
            action: "rotated_secret",
            actorId,
            meta: {},
          },
        });

        return { client, newSecret };
      });

      return {
        client: toClientMeta(updated),
        secret: newSecret,
      };
    }),

  revokeClient: internalPerm(P.service.manage)
    .input(
      z.object({
        clientId: z.string().regex(/^svc_[0-9a-f]{32}$/, "Invalid client ID format"),
      }),
    )
    .output(clientMetaSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);

      // SI-008: prevent double-revocation
      const existing = await ctx.prisma.serviceMachineClient.findFirst({
        where: { clientId: input.clientId, orgId },
      });
      if (!existing) throw apiError("NOT_FOUND", "Service client not found");
      if (existing.status === "revoked") throw apiError("CONFLICT", "Client is already revoked");

      const updated = await ctx.prisma.serviceMachineClient.update({
        where: { id: existing.id },
        data: {
          status: "revoked",
          auditLogs: {
            create: {
              action: "revoked",
              actorId,
            },
          },
        },
      });

      return toClientMeta(updated);
    }),

  authProbe: serviceScopedProcedure("service.read")
    .input(z.void())
    .output(
      z.object({
        ok: z.literal(true),
        scopes: z.array(z.string()),
      }),
    )
    .query(async ({ ctx }) => {
      return {
        ok: true,
        scopes: ctx.serviceScopes,
      };
    }),
});
