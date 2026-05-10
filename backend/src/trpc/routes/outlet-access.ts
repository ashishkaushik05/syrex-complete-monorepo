import type { TrpcContext } from "../context";
import { apiError } from "../error";

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

  const hasLinkedOutlet = await ctx.prisma.outlet.findFirst({
    where: { userId: actorId },
    select: { id: true },
  });

  if (hasLinkedOutlet) {
    throw apiError("NOT_FOUND", "Outlet not found");
  }
}
