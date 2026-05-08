import type { Context } from "hono";
import { prisma } from "../infra/db/prisma";

export type RequestActor = {
  id: string | null;
  orgId: string | null;
};

export type TrpcContext = {
  requestId: string;
  actor: RequestActor;
  prisma: typeof prisma;
};

function readHeader(c: Context, key: string) {
  return c.req.header(key) ?? null;
}

export function createRequestContext(c: Context): TrpcContext {
  return {
    requestId: readHeader(c, "x-request-id") ?? crypto.randomUUID(),
    actor: {
      id: readHeader(c, "x-actor-id"),
      orgId: readHeader(c, "x-org-id")
    },
    prisma
  };
}
