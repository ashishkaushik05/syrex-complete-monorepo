import { Hono } from "hono";
import type { Context } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createRequestContext } from "./trpc/context";
import { prisma } from "./infra/db/prisma";
import { addSseConnection, removeSseConnection } from "./infra/sse";
import { P, SUPER_ADMIN_PERMISSION } from "./rbac/catalog";
import { verifyAccessToken } from "./trpc/routes/auth";

type ActorResolution = {
  userId: string;
  sessionId: string;
};

export async function resolveActorFromBearer(
  c: Pick<Context, "req">,
  deps: Pick<typeof prisma, "authSession"> = prisma
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

  return {
    userId: session.userId,
    sessionId: claims.sessionId
  };
}

export function createApp() {
  const app = new Hono();

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

  // Resolve Bearer JWT for actor/session context and ignore inbound x-actor-id.
  app.use("/trpc/*", async (c, next) => {
    c.req.raw.headers.delete("x-actor-id");
    c.req.raw.headers.delete("x-auth-session-id");

    const resolved = await resolveActorFromBearer(c);
    if (resolved) {
      c.req.raw.headers.set("x-actor-id", resolved.userId);
      c.req.raw.headers.set("x-auth-session-id", resolved.sessionId);
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

    const user = await prisma.user.findUnique({
      where: { id: resolved.userId },
      include: { role: { select: { permissions: true } } }
    });
    if (!user || user.userType !== "internal") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const perms = user.role.permissions;
    if (!perms.includes(SUPER_ADMIN_PERMISSION) && !perms.includes(P.field.read)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const requestedOrgId = c.req.header("x-org-id");
    // Users without super-admin perms may only subscribe to a specific org
    // (org ID comes from client header — User model has no direct orgId field).
    // Wildcard subscription is restricted to super-admins ONLY. C-12: previously
    // `orgs:read` could also wildcard-subscribe; that permission is for reading
    // org records, not for streaming all orgs' live field data.
    const canAccessAllOrgs = perms.includes(SUPER_ADMIN_PERMISSION) || perms.includes(P.field.admin);
    if (!requestedOrgId && !canAccessAllOrgs) {
      return c.json({ error: "x-org-id header required" }, 400);
    }
    const orgId = requestedOrgId ?? "*";
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
