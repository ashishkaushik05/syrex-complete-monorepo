import { createTRPCRouter } from "./trpc";
import { systemRouter } from "./routes/system";

export const appRouter = createTRPCRouter({
  system: systemRouter
});

export type AppRouter = typeof appRouter;
