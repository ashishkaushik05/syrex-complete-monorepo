import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./infra/logger";
import { assertPermissionCatalogIntegrity } from "./rbac/catalog";
import { prisma } from "./infra/db/prisma";

assertPermissionCatalogIntegrity();

if (!env.SERVICE_PORTAL_JWT_SECRET) {
  throw new Error("SERVICE_PORTAL_JWT_SECRET must be set, >=32 chars");
}

// Idempotent bootstrap: ensure the complaint number sequence exists.
// Retried with backoff because this can race Postgres still starting up
// (e.g. right after a machine reboot, before Docker's DB container is
// ready to accept connections) — a bare fire-and-forget attempt here
// silently loses that race and leaves the sequence missing until the
// next successful boot. db:reset also recreates it explicitly via
// scripts/ensure-sequences.ts, since --force-reset drops it.
async function ensureComplaintNumberSequence(retries = 5, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$executeRaw`CREATE SEQUENCE IF NOT EXISTS service_complaint_number_seq`;
      return;
    } catch (err) {
      if (attempt === retries) {
        logger.error("bootstrap_sequence_failed", { err, attempts: attempt });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

await ensureComplaintNumberSequence();

const app = createApp();

// Field Sense: auto-start runs every minute, checks per-user schedule ±2 min
Bun.cron(`${import.meta.dir}/cron/field-auto-start.ts`, "* * * * *", "field-auto-start");

// Field Sense: auto-close runs at 13:30 UTC = 19:00 IST (Asia/Kolkata)
Bun.cron(`${import.meta.dir}/cron/field-auto-close.ts`, "30 13 * * *", "field-auto-close");

// Field Sense: location retention runs daily at 20:10 UTC. The job is
// configurable with FIELD_LOCATION_RETENTION_DAYS and can be disabled by env.
Bun.cron(
  `${import.meta.dir}/cron/field-location-retention.ts`,
  "10 20 * * *",
  "field-location-retention"
);

// SKU demand prediction: daily snapshot at 02:00 UTC (07:30 IST).
// Configurable window via DEMAND_LOOKBACK_DAYS env var (default: 30).
Bun.cron(
  `${import.meta.dir}/cron/sku-demand-snapshot.ts`,
  "0 2 * * *",
  "sku-demand-snapshot"
);

export default {
  port: env.PORT,
  fetch: app.fetch
};

logger.info("backend_starting", {
  port: env.PORT,
  env: env.NODE_ENV
});

process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down gracefully');
  // Give in-flight requests 5s to complete
  setTimeout(() => process.exit(0), 5000);
});
process.on('SIGINT', () => {
  console.log('[server] SIGINT received');
  process.exit(0);
});
