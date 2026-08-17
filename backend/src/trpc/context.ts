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
  serviceUser: { id: string; sessionId: string } | null;
  prisma: typeof prisma;
  permissions: string[];
  managedWarehouseId: string | null;
  userType: string | null;
  linkedOutletId: string | null;
  serviceClientId: string | null;
  serviceClientSecret: string | null;
  serviceScopes: string[];
  sourceIp: string;
};

function readHeader(c: Context, key: string) {
  return c.req.header(key) ?? null;
}

function parseBasicAuth(c: Context): { serviceClientId: string | null; serviceClientSecret: string | null } {
  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.startsWith("Basic ")) {
    return { serviceClientId: null, serviceClientSecret: null };
  }
  try {
    const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 1) return { serviceClientId: null, serviceClientSecret: null };
    return {
      serviceClientId: decoded.slice(0, colon),
      serviceClientSecret: decoded.slice(colon + 1),
    };
  } catch {
    return { serviceClientId: null, serviceClientSecret: null };
  }
}

export function readSourceIp(c: Pick<Context, "req">) {
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = c.req.header("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}

export function createRequestContext(c: Context): TrpcContext {
  const serviceUserIdVar = c.get("serviceUserId") as string | null | undefined;
  const serviceUserSessionIdVar = c.get("serviceUserSessionId") as string | null | undefined;
  return {
    requestId: readHeader(c, "x-request-id") ?? crypto.randomUUID(),
    actor: {
      id: (c.get("actorId") as string | undefined) ?? null,
      orgId: process.env.DEFAULT_ORG_ID ?? null,
      sessionId: (c.get("sessionId") as string | undefined) ?? null,
    },
    serviceUser:
      serviceUserIdVar && serviceUserSessionIdVar
        ? { id: serviceUserIdVar, sessionId: serviceUserSessionIdVar }
        : null,
    prisma,
    permissions: (c.get("permissions") as string[] | undefined) ?? [],
    managedWarehouseId: (c.get("managedWarehouseId") as string | null | undefined) ?? null,
    userType: (c.get("userType") as string | null | undefined) ?? null,
    linkedOutletId: (c.get("linkedOutletId") as string | null | undefined) ?? null,
    ...parseBasicAuth(c),
    serviceScopes: [],
    sourceIp: readSourceIp(c)
  };
}
