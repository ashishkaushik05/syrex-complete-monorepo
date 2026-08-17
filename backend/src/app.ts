import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createRequestContext } from "./trpc/context";
import { prisma } from "./infra/db/prisma";
import { addSseConnection, removeSseConnection } from "./infra/sse";
import { P, SUPER_ADMIN_PERMISSION } from "./rbac/catalog";
import { verifyAccessToken } from "./trpc/routes/auth";
import { verifyServiceUserAccessToken } from "./trpc/routes/service-portal-auth";
import { env } from "./config/env";

type ActorResolution = {
  userId: string;
  sessionId: string;
  permissions: string[];
  managedWarehouseId: string | null;
  userType: string;
  linkedOutletId: string | null;
};

type AppVariables = {
  actorId: string;
  sessionId: string;
  permissions: string[];
  managedWarehouseId: string | null;
  userType: string;
  linkedOutletId: string | null;
  serviceUserId: string | null;
  serviceUserSessionId: string | null;
};

export async function resolveServiceUserFromBearer(
  token: string,
  deps: Pick<typeof prisma, "serviceUserSession" | "serviceUser"> = prisma,
): Promise<{ id: string; sessionId: string } | null> {
  try {
    const claims = await verifyServiceUserAccessToken(token);
    if (!claims) return null;
    const [session, user] = await Promise.all([
      deps.serviceUserSession.findUnique({
        where: { id: claims.sessionId },
        select: { serviceUserId: true, expiresAt: true, revokedAt: true },
      }),
      deps.serviceUser.findUnique({
        where: { id: claims.serviceUserId },
        select: { isActive: true },
      }),
    ]);
    if (
      !session ||
      session.serviceUserId !== claims.serviceUserId ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !user?.isActive
    ) {
      return null;
    }
    return { id: claims.serviceUserId, sessionId: claims.sessionId };
  } catch {
    return null;
  }
}

export async function resolveActorFromBearer(
  c: Pick<Context, "req">,
  deps: Pick<typeof prisma, "authSession" | "user" | "outlet"> = prisma
): Promise<ActorResolution | null> {
  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    return null;
  }

  const session = await deps.authSession.findUnique({
    where: { id: claims.sessionId },
    select: { userId: true, expiresAt: true, revokedAt: true }
  });

  if (!session || session.userId !== claims.userId) {
    return null;
  }

  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const [user, linkedOutlet] = await Promise.all([
    deps.user.findUnique({
      where: { id: session.userId },
      select: {
        userType: true,
        isActive: true,
        role: { select: { permissions: true } },
        managedWarehouse: { select: { id: true } },
      },
    }),
    deps.outlet.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    }),
  ]);

  if (!user || !user.isActive) {
    return null;
  }

  return {
    userId: session.userId,
    sessionId: claims.sessionId,
    permissions: user.role?.permissions ?? [],
    managedWarehouseId: user.managedWarehouse?.id ?? null,
    userType: user.userType,
    linkedOutletId: linkedOutlet?.id ?? null,
  };
}

export function createApp(options: {
  corsOrigins?: string[];
  isProduction?: boolean;
  maxRequestBodyBytes?: number;
} = {}) {
  const app = new Hono<{ Variables: AppVariables }>();
  const corsOrigins = options.corsOrigins ?? env.CORS_ORIGINS;
  const isProduction = options.isProduction ?? env.NODE_ENV === "production";
  const maxRequestBodyBytes = options.maxRequestBodyBytes ?? env.MAX_REQUEST_BODY_BYTES;

  app.use("*", async (c, next) => {
    await next();
    c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    c.header("Cache-Control", "no-store");
    if (isProduction) {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  if (corsOrigins.length) {
    app.use("*", async (c, next) => {
      const origin = c.req.header("origin");
      if (origin && !corsOrigins.includes(origin)) {
        return c.json({ error: "Origin not allowed" }, 403);
      }
      return next();
    });
    app.use("*", cors({
      origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }));
  }

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  app.get("/ready", async (c) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "not_ready" }, 503);
    }
  });

  // Resolve Bearer JWT: staff actor first, then service-user fallback.
  app.use("/trpc/*", async (c, next) => {
    const contentLength = c.req.header("content-length");
    if (contentLength) {
      if (!/^\d+$/.test(contentLength)) {
        return c.json({ error: "Invalid Content-Length" }, 400);
      }
      if (Number(contentLength) > maxRequestBodyBytes) {
        return c.json({ error: "Request body too large" }, 413);
      }
    }
    await next();
  });

  app.use("/trpc/*", async (c, next) => {
    const authHeader = c.req.header("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    const resolved = await resolveActorFromBearer(c);
    if (resolved) {
      c.set("actorId", resolved.userId);
      c.set("sessionId", resolved.sessionId);
      c.set("permissions", resolved.permissions);
      c.set("managedWarehouseId", resolved.managedWarehouseId);
      c.set("userType", resolved.userType);
      c.set("linkedOutletId", resolved.linkedOutletId);
    } else if (token) {
      const serviceUser = await resolveServiceUserFromBearer(token);
      if (serviceUser) {
        c.set("serviceUserId", serviceUser.id);
        c.set("serviceUserSessionId", serviceUser.sessionId);
      }
    }
    await next();
  });

  app.all("/trpc/*", async (c) => {
    return fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createRequestContext(c)
    });
  });

  // SSE live-stream: internal field:read users only
  app.get("/field/live-stream", async (c) => {
    const resolved = await resolveActorFromBearer(c);
    if (!resolved) return c.json({ error: "Unauthorized" }, 401);

    if (resolved.userType !== "internal") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const perms = resolved.permissions;
    if (!perms.includes(SUPER_ADMIN_PERMISSION) && !perms.includes(P.field.read)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Super-admins/field-admins subscribe to all orgs via wildcard; everyone else scopes to the deployment org.
    const canAccessAllOrgs = perms.includes(SUPER_ADMIN_PERMISSION) || perms.includes(P.field.admin);
    if (!canAccessAllOrgs && !process.env.DEFAULT_ORG_ID) {
      return c.json({ error: "Server misconfiguration: DEFAULT_ORG_ID not set" }, 500);
    }
    const orgId = canAccessAllOrgs ? "*" : process.env.DEFAULT_ORG_ID!;
    const encoder = new TextEncoder();
    let ctrl: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        ctrl = controller;
        addSseConnection(orgId, controller);
        controller.enqueue(encoder.encode(": connected\n\n"));

        const hb = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(hb);
          }
        }, 30_000);

        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(hb);
          removeSseConnection(orgId, ctrl);
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        removeSseConnection(orgId, ctrl);
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  });

  return app;
}
