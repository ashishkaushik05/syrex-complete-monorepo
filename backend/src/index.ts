import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./infra/logger";
import { assertPermissionCatalogIntegrity } from "./rbac/catalog";

assertPermissionCatalogIntegrity();

const app = createApp();

// Field Sense: auto-start runs every minute, checks per-user schedule ±2 min
Bun.cron(`${import.meta.dir}/cron/field-auto-start.ts`, "* * * * *", "field-auto-start");

// Field Sense: auto-close runs at 13:30 UTC = 19:00 IST (Asia/Kolkata)
Bun.cron(`${import.meta.dir}/cron/field-auto-close.ts`, "30 13 * * *", "field-auto-close");

export default {
  port: env.PORT,
  fetch: app.fetch
};

logger.info("backend_starting", {
  port: env.PORT,
  env: env.NODE_ENV
});
