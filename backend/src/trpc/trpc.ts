import { initTRPC } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { type CatalogPermission, SUPER_ADMIN_PERMISSION } from "../rbac/catalog";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, ctx }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        requestId: ctx?.requestId ?? null
      }
    };
  }
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.actor.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing actor context"
    });
  }
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.actor.id },
    include: {
      role: { select: { permissions: true } },
      managedWarehouse: { select: { id: true } }
    }
  });
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Actor not found"
    });
  }
  return next({
    ctx: {
      ...ctx,
      permissions: user.role.permissions,
      managedWarehouseId: user.managedWarehouse?.id ?? null
    }
  });
});

export const protectedProcedure = t.procedure.use(authMiddleware);

export const perm = (permission: CatalogPermission) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const perms = ctx.permissions;
    if (!perms.includes(SUPER_ADMIN_PERMISSION) && !perms.includes(permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires: ${permission}`
      });
    }
    return next({ ctx });
  });

const serviceCredentialMiddleware = t.middleware(async ({ ctx, next }) => {
  const clientId = ctx.serviceClientId;
  const secret = ctx.serviceClientSecret;
  if (!clientId || !secret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing service client credentials",
    });
  }

  const client = await ctx.prisma.serviceMachineClient.findUnique({
    where: { clientId },
    select: {
      id: true,
      clientId: true,
      secretHash: true,
      status: true,
      scopes: true,
      expiresAt: true,
    },
  });

  if (!client || client.status !== "active") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid service client",
    });
  }

  if (client.expiresAt && client.expiresAt.getTime() <= Date.now()) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Service client expired",
    });
  }

  const isValidSecret = await Bun.password.verify(secret, client.secretHash);
  if (!isValidSecret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid service client secret",
    });
  }

  await ctx.prisma.serviceMachineClient.update({
    where: { id: client.id },
    data: {
      lastUsedAt: new Date(),
      auditLogs: {
        create: {
          action: "authenticated",
          actorId: ctx.actor.id,
          meta: {
            requestId: ctx.requestId,
          },
        },
      },
    },
  });

  return next({
    ctx: {
      ...ctx,
      serviceScopes: client.scopes,
    },
  });
});

export const serviceCredentialProcedure = publicProcedure.use(serviceCredentialMiddleware);

export const serviceScopedProcedure = (requiredScope: string) =>
  serviceCredentialProcedure.use(async ({ ctx, next }) => {
    if (!ctx.serviceScopes.includes(requiredScope)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing service scope: ${requiredScope}`,
      });
    }
    return next({ ctx });
  });
