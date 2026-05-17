import { z } from "zod";
import { createTRPCRouter, perm, serviceScopedProcedure } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";

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
  listClients: perm(P.service.manage)
    .input(z.void())
    .output(z.array(clientMetaSchema))
    .query(async ({ ctx }) => {
      const rows = await ctx.prisma.serviceMachineClient.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return rows.map(toClientMeta);
    }),

  createClient: perm(P.service.manage)
    .input(
      z.object({
        name: z.string().min(2).max(120),
        scopes: z.array(z.string().min(1)).min(1),
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
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const clientId = `svc_${crypto.randomUUID().replace(/-/g, "")}`;
      const secret = `sk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
      const secretHash = await Bun.password.hash(secret);
      const secretLast4 = secret.slice(-4);

      const created = await ctx.prisma.serviceMachineClient.create({
        data: {
          clientId,
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

  rotateSecret: perm(P.service.manage)
    .input(
      z.object({
        clientId: z.string().min(8),
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
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const existing = await ctx.prisma.serviceMachineClient.findUnique({
        where: { clientId: input.clientId },
      });
      if (!existing) throw apiError("NOT_FOUND", "Service client not found");

      const secret = `sk_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
      const secretHash = await Bun.password.hash(secret);
      const secretLast4 = secret.slice(-4);

      const updated = await ctx.prisma.serviceMachineClient.update({
        where: { id: existing.id },
        data: {
          secretHash,
          secretLast4,
          rotatedAt: new Date(),
          auditLogs: {
            create: {
              action: "rotated_secret",
              actorId,
            },
          },
        },
      });

      return {
        client: toClientMeta(updated),
        secret,
      };
    }),

  revokeClient: perm(P.service.manage)
    .input(
      z.object({
        clientId: z.string().min(8),
      }),
    )
    .output(clientMetaSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) throw apiError("UNAUTHORIZED", "Missing actor context");

      const existing = await ctx.prisma.serviceMachineClient.findUnique({
        where: { clientId: input.clientId },
      });
      if (!existing) throw apiError("NOT_FOUND", "Service client not found");

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
