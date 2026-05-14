import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createRequestContext } from "./trpc/context";
import { prisma } from "./infra/db/prisma";
import { addSseConnection, removeSseConnection } from "./infra/sse";
import { P, SUPER_ADMIN_PERMISSION } from "./rbac/catalog";

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

  // Resolve bearer token → actor headers before tRPC handler.
  // Internal callers may still send x-actor-id directly (trusted network only).
  app.use("/trpc/*", async (c, next) => {
    const existingActorId = c.req.header("x-actor-id");
    if (!existingActorId) {
      const auth = c.req.header("authorization") ?? "";
      if (auth.startsWith("Bearer ")) {
        const token = auth.slice(7);
        const session = await prisma.authSession.findUnique({
          where: { accessToken: token },
          select: { userId: true, expiresAt: true, revokedAt: true }
        });
        if (session && !session.revokedAt && session.expiresAt.getTime() > Date.now()) {
          c.req.raw.headers.set("x-actor-id", session.userId);
        }
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
    // Resolve actor from Bearer token or direct x-actor-id header
    let actorId = c.req.header("x-actor-id");
    if (!actorId) {
      const auth = c.req.header("authorization") ?? "";
      if (auth.startsWith("Bearer ")) {
        const token = auth.slice(7);
        const session = await prisma.authSession.findUnique({
          where: { accessToken: token },
          select: { userId: true, expiresAt: true, revokedAt: true }
        });
        if (session && !session.revokedAt && session.expiresAt.getTime() > Date.now()) {
          actorId = session.userId;
        }
      }
    }
    if (!actorId) return c.json({ error: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { id: actorId },
      include: { role: { select: { permissions: true } } }
    });
    if (!user || user.userType !== "internal") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const perms = user.role.permissions;
    if (!perms.includes(SUPER_ADMIN_PERMISSION) && !perms.includes(P.field.read)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const orgId = c.req.header("x-org-id") ?? "*";
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
          try { controller.close(); } catch { /* already closed */ }
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
