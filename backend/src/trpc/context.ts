import type { Context } from "hono";
import { prisma } from "../infra/db/prisma";

export type RequestActor = {
  id: string | null;
  orgId: string | null;
  sessionId: string | null;
};

export type TrpcContext = {
  requestId: string;
  actor: RequestActor;
  prisma: typeof prisma;
  permissions: string[];
  managedWarehouseId: string | null;
  serviceClientId: string | null;
  serviceClientSecret: string | null;
  serviceScopes: string[];
  sourceIp: string;
};

function readHeader(c: Context, key: string) {
  return c.req.header(key) ?? null;
}

function readSourceIp(c: Context) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function createRequestContext(c: Context): TrpcContext {
  return {
    requestId: readHeader(c, "x-request-id") ?? crypto.randomUUID(),
    actor: {
      // x-actor-id and x-auth-session-id are injected only by app middleware after JWT verification.
      id: readHeader(c, "x-actor-id"),
      orgId: readHeader(c, "x-org-id"),
      sessionId: readHeader(c, "x-auth-session-id")
    },
    prisma,
    permissions: [],
    managedWarehouseId: null,
    serviceClientId: readHeader(c, "x-service-client-id"),
    serviceClientSecret: readHeader(c, "x-service-client-secret"),
    serviceScopes: [],
    sourceIp: readSourceIp(c)
  };
}
