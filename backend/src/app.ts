import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createRequestContext } from "./trpc/context";
import { prisma } from "./infra/db/prisma";

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

  app.all("/trpc/*", async (c) => {
    return fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createRequestContext(c)
    });
  });

  return app;
}
