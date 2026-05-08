import { z } from "zod";

export const paginationInputSchema = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(25)
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export function decodeCursor(cursor?: string | null) {
  if (!cursor) {
    return null;
  }
  const decoded = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
  if (Number.isNaN(decoded) || decoded < 0) {
    return null;
  }
  return decoded;
}

export function encodeCursor(offset: number | null) {
  if (offset === null) {
    return null;
  }
  return Buffer.from(String(offset), "utf8").toString("base64url");
}
