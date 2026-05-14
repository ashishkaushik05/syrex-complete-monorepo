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
