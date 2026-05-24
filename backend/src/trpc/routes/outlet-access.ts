import type { TrpcContext } from "../context";
import { apiError } from "../error";
import { SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";

export function assertWarehouseScope(ctx: TrpcContext, resourceWarehouseId: string | null): void {
  if (ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) return;
  if (!ctx.managedWarehouseId) return;
  if (ctx.managedWarehouseId !== resourceWarehouseId) {
    throw apiError("FORBIDDEN", "Outside managed warehouse scope");
  }
}

export async function assertOutletWarehouseScope(ctx: TrpcContext, outletId: string): Promise<void> {
  if (ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) return;
  if (!ctx.managedWarehouseId) return;
  const outlet = await ctx.prisma.outlet.findUnique({
    where: { id: outletId },
    select: { warehouseId: true }
  });
  if (!outlet || outlet.warehouseId !== ctx.managedWarehouseId) {
    throw apiError("FORBIDDEN", "Outside managed warehouse scope");
  }
}

export async function findActorLinkedOutletId(
  ctx: TrpcContext,
): Promise<string | null> {
  const actorId = ctx.actor.id;
  if (!actorId) {
    return null;
  }

  const linked = await ctx.prisma.outlet.findUnique({
    where: { userId: actorId },
    select: { id: true },
  });

  return linked?.id ?? null;
}

export async function assertOutletAccess(
  ctx: TrpcContext,
  outletId: string,
): Promise<void> {
  const actorId = ctx.actor.id;
  if (!actorId) {
    throw apiError("UNAUTHORIZED", "Missing actor context");
  }

  const scoped = await ctx.prisma.outlet.findFirst({
    where: {
      id: outletId,
      userId: actorId,
    },
    select: { id: true },
  });

  if (scoped) {
    return;
  }

  if (ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) {
    return;
  }

  throw apiError("FORBIDDEN", "Access denied to this outlet");
}
