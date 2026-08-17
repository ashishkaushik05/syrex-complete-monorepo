import type { PrismaClient } from "@prisma/client";
import { prisma } from "../infra/db/prisma";
import { acquireLock } from "./cron-lock";

type RetentionOptions = {
  now?: Date;
  retentionDays?: number;
  disabled?: boolean;
  prismaClient?: Pick<PrismaClient, "fieldLocation">;
};

export function retentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function envRetentionDays() {
  const raw = Bun.env.FIELD_LOCATION_RETENTION_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 90;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

function envRetentionDisabled() {
  const raw = Bun.env.FIELD_LOCATION_RETENTION_DISABLED;
  return raw === "true" || raw === "1";
}

export async function runFieldLocationRetention(options: RetentionOptions = {}) {
  const disabled = options.disabled ?? envRetentionDisabled();
  const retentionDays = options.retentionDays ?? envRetentionDays();
  const now = options.now ?? new Date();

  if (disabled) {
    console.log(
      JSON.stringify({
        event: "field_location_retention_skipped",
        reason: "disabled",
        retentionDays
      })
    );
    return { deleted: 0, disabled: true, cutoff: null };
  }

  const cutoff = retentionCutoff(now, retentionDays);
  const client = options.prismaClient ?? prisma;
  const result = await client.fieldLocation.deleteMany({
    where: { recordedAt: { lt: cutoff } }
  });

  console.log(
    JSON.stringify({
      event: "field_location_retention_completed",
      deleted: result.count,
      retentionDays,
      cutoff: cutoff.toISOString()
    })
  );

  return { deleted: result.count, disabled: false, cutoff };
}

async function run() {
  const runKey = new Date().toISOString().slice(0, 10);
  const got = await acquireLock("field-location-retention", runKey);
  if (!got) {
    console.warn(
      `[field-location-retention] lock already held for ${runKey}, skipping`
    );
    return;
  }

  await runFieldLocationRetention();
}

export default run;

if (import.meta.main) {
  run()
    .then(() => {
      console.log("[field-location-retention] done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[field-location-retention] fatal:", err);
      process.exit(1);
    });
}
