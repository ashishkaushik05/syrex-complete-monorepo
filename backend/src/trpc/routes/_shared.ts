import { z } from "zod";
import { SUPER_ADMIN_PERMISSION } from "../../rbac/catalog";
import { apiError } from "../error";

// Privilege-escalation guard (DEC-20260612-004 / -007): an actor may only grant a role
// whose permission set they themselves hold. Super-admins (`*`) may grant anything;
// everyone else is blocked from granting the wildcard or any permission outside their own
// grant. Shared by invitations.create and users.create/update. Mirrors the wildcard guard
// in roles.update.
export function assertCanGrantPermissions(
  actorPermissions: readonly string[],
  targetPermissions: readonly string[]
): void {
  if (actorPermissions.includes(SUPER_ADMIN_PERMISSION)) {
    return;
  }
  if (targetPermissions.includes(SUPER_ADMIN_PERMISSION)) {
    throw apiError("FORBIDDEN", "Only super-admins can grant the wildcard permission");
  }
  const missing = targetPermissions.filter((permission) => !actorPermissions.includes(permission));
  if (missing.length > 0) {
    throw apiError(
      "FORBIDDEN",
      `Cannot grant a role with permissions you do not hold: ${missing.join(", ")}`
    );
  }
}

export const paginationInputSchema = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(25)
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export type CursorPayload = { ts: string; id: string };

export function encodeCursor(last: { createdAt: Date; id: string }): string {
  const payload: CursorPayload = { ts: last.createdAt.toISOString(), id: last.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor?: string | null): CursorPayload | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).ts !== "string" ||
      typeof (parsed as Record<string, unknown>).id !== "string"
    ) {
      return null;
    }
    return { ts: (parsed as CursorPayload).ts, id: (parsed as CursorPayload).id };
  } catch {
    return null;
  }
}
