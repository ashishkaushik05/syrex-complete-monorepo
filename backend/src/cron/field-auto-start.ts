import { prisma } from "../infra/db/prisma";
import { acquireLock } from "./cron-lock";

function currentTimeInZone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  return `${h}:${m}`;
}

function todayUtcInZone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function run() {
  // C-16: cross-instance lock. Per-minute jobs key by minute resolution.
  const runKey = new Date().toISOString().slice(0, 16);
  const got = await acquireLock("field-auto-start", runKey);
  if (!got) {
    console.warn(
      `[field-auto-start] lock already held for ${runKey}, skipping`
    );
    return;
  }

  const schedules = await prisma.shiftSchedule.findMany({
    where: { isEnabled: true },
    select: { userId: true, orgId: true, autoStartTime: true, timezone: true }
  });

  for (const schedule of schedules) {
    try {
      const now = currentTimeInZone(schedule.timezone);
      const [nowH, nowM] = now.split(":").map(Number);
      const [schH, schM] = schedule.autoStartTime.split(":").map(Number);
      const nowMinutes = nowH * 60 + nowM;
      const schMinutes = schH * 60 + schM;
      const delta = Math.abs(nowMinutes - schMinutes);
      if (delta > 2) continue;

      // Already has an active shift
      const activeShift = await prisma.shift.findFirst({
        where: { agentId: schedule.userId, status: "active" }
      });
      if (activeShift) continue;

      // Already auto-started today
      const today = todayUtcInZone(schedule.timezone);
      const autoToday = await prisma.shift.findFirst({
        where: {
          agentId: schedule.userId,
          startType: "auto",
          startedAt: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lt: new Date(`${today}T23:59:59.999Z`)
          }
        }
      });
      if (autoToday) continue;

      // Create shift + upsert attendance atomically
      await prisma.$transaction(async (tx) => {
        await tx.shift.create({
          data: {
            agentId: schedule.userId,
            orgId: schedule.orgId,
            startType: "auto",
            status: "active"
          }
        });

        await tx.dailyAttendance.upsert({
          where: { userId_date: { userId: schedule.userId, date: today } },
          create: {
            userId: schedule.userId,
            orgId: schedule.orgId,
            date: today,
            status: "present"
          },
          update: {}
        });
      });
    } catch (err) {
      console.error(`[field-auto-start] error for user ${schedule.userId}:`, err);
    }
  }
}

// Bun.cron entry point
export default run;

// Standalone run
if (import.meta.main) {
  run()
    .then(() => {
      console.log("[field-auto-start] done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[field-auto-start] fatal:", err);
      process.exit(1);
    });
}
