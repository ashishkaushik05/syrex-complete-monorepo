import type { TrpcContext } from "../context";
import { apiError } from "../error";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";

export function actorHasInternalSalesOutletAccess(ctx: TrpcContext): boolean {
  if (!ctx.actor.id) return false;
  if (!ctx.permissions.includes(P.outlets.read) || !ctx.permissions.includes(P.orders.write)) {
    return false;
  }
  return ctx.userType === "internal";
}

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

export function findActorLinkedOutletId(ctx: TrpcContext): string | null {
  return ctx.linkedOutletId ?? null;
}

export type FinancialScope = {
  linkedOutletId: string | null;
  hasGlobalAccess: boolean;
  isWarehouseScoped: boolean;
};

export function resolveFinancialScope(
  ctx: TrpcContext,
  options?: { includeInternalSales?: boolean; errorMessage?: string },
): FinancialScope {
  const linkedOutletId = findActorLinkedOutletId(ctx);
  const isSuperAdmin = ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
  const hasInternalSalesAccess =
    options?.includeInternalSales ? actorHasInternalSalesOutletAccess(ctx) : false;
  const hasGlobalAccess = isSuperAdmin || hasInternalSalesAccess;
  const isWarehouseScoped = !hasGlobalAccess && !linkedOutletId && !!ctx.managedWarehouseId;

  if (!hasGlobalAccess && !linkedOutletId && !isWarehouseScoped) {
    throw apiError("FORBIDDEN", options?.errorMessage ?? "No safe scope available");
  }

  return { linkedOutletId, hasGlobalAccess, isWarehouseScoped };
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

  if (actorHasInternalSalesOutletAccess(ctx)) {
    return;
  }

  if (ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) {
    return;
  }

  throw apiError("FORBIDDEN", "Access denied to this outlet");
}
