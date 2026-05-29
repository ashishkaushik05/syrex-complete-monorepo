import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";

export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL: "INTERNAL"
} as const;

export type ApiErrorCode = keyof typeof ERROR_CODES;

const TRPC_CODE_MAP: Record<ApiErrorCode, TRPC_ERROR_CODE_KEY> = {
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL: "INTERNAL_SERVER_ERROR"
};

export function apiError(code: ApiErrorCode, message: string, cause?: unknown) {
  return new TRPCError({
    code: TRPC_CODE_MAP[code],
    message,
    cause
  });
}
