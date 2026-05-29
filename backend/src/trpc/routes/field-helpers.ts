import type { PrismaClient } from "@prisma/client";
import type { TrpcContext } from "../context";
import { apiError } from "../error";
import { P, SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";

export async function assertFieldEnabled(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isFieldEnabled: true, userType: true }
  });
  if (!user?.isFieldEnabled) {
    throw apiError("FORBIDDEN", "Field Sense not enabled for this user");
  }
  if (user.userType !== "internal") {
    throw apiError("FORBIDDEN", "Field Sense is only available to internal users");
  }
}

export const MAX_LOCATION_ACCURACY_METERS = 10_000;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type LocationValidationResult =
  | { ok: true; recordedAt: Date; capturedAt: Date | null }
  | { ok: false; reason: string };

export function canCrossOrg(ctx: TrpcContext) {
  return ctx.permissions.includes(SUPER_ADMIN_PERMISSION);
}

export function canViewOtherFieldUsers(ctx: TrpcContext) {
  return (
    canCrossOrg(ctx) ||
    ctx.permissions.includes(P.field.admin)
  );
}

export function resolveReadOrgId(
  ctx: TrpcContext,
  requestedOrgId?: string | null
) {
  if (canViewOtherFieldUsers(ctx)) {
    return requestedOrgId ?? ctx.actor.orgId ?? undefined;
  }

  const actorOrgId = ctx.actor.orgId;
  if (!actorOrgId) {
    throw apiError("BAD_REQUEST", "orgId required");
  }
  if (requestedOrgId && requestedOrgId !== actorOrgId) {
    throw apiError("FORBIDDEN", "Cross-org field reads are not allowed");
  }
  return actorOrgId;
}

export function assertCanReadAgent(ctx: TrpcContext, targetAgentId: string) {
  const callerId = ctx.actor.id!;
  if (targetAgentId !== callerId && !canViewOtherFieldUsers(ctx)) {
    throw apiError("FORBIDDEN", "Viewing another user's field data requires field:admin");
  }
}

export function validateLocationPoint(input: {
  lat: number;
  lng: number;
  accuracy: number;
  recordedAt: string;
  capturedAt?: string | null;
}): LocationValidationResult {
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    return { ok: false, reason: "INVALID_LAT" };
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    return { ok: false, reason: "INVALID_LNG" };
  }
  if (
    !Number.isFinite(input.accuracy) ||
    input.accuracy < 0 ||
    input.accuracy > MAX_LOCATION_ACCURACY_METERS
  ) {
    return { ok: false, reason: "INVALID_ACCURACY" };
  }

  const recordedAt = new Date(input.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) {
    return { ok: false, reason: "INVALID_RECORDED_AT" };
  }
  if (recordedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: "RECORDED_AT_TOO_FAR_IN_FUTURE" };
  }

  let capturedAt: Date | null = null;
  if (input.capturedAt) {
    capturedAt = new Date(input.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) {
      return { ok: false, reason: "INVALID_CAPTURED_AT" };
    }
    if (capturedAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      return { ok: false, reason: "CAPTURED_AT_TOO_FAR_IN_FUTURE" };
    }
  }

  return { ok: true, recordedAt, capturedAt };
}

// L-12: validate IANA timezone strings. `Intl.DateTimeFormat(undefined, …)`
// does not reliably throw across runtimes — the format step does.
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

// L-14: shared date-range filter for Prisma `where` clauses.
// Returns `{ gte?, lte? }` or `undefined` when no filter is requested.
// Single-date inputs select a 24h window starting at the given date (UTC).
export function buildDateRangeFilter(
  dateStr?: string,
  from?: string,
  to?: string
): { gte?: Date; lte?: Date } | undefined {
  if (dateStr) {
    const start = new Date(dateStr);
    const end = new Date(dateStr);
    end.setDate(end.getDate() + 1);
    return { gte: start, lte: end };
  }
  if (from || to) {
    return {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {})
    };
  }
  return undefined;
}

