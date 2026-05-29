import { z } from "zod";
import { createTRPCRouter, perm, serviceScopedProcedure } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
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
  listClients: perm(P.service.manage)
    .input(z.void())
    .output(z.array(clientMetaSchema))
    .query(async ({ ctx }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const rows = await ctx.prisma.serviceMachineClient.findMany({
        where: { orgId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return rows.map(toClientMeta);
    }),

  createClient: perm(P.service.manage)
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

  rotateSecret: perm(P.service.manage)
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

  revokeClient: perm(P.service.manage)
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
