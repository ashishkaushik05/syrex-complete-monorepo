import { prisma } from "../infra/db/prisma";
import { acquireLock, sweepStaleLocks } from "./cron-lock";

// Closes active shifts respecting each agent's timezone.
// For agents WITH an enabled shiftSchedule: only close if local time >= 19:00.
// For agents WITHOUT a schedule (or schedule disabled): close unconditionally
// (cron fires at 19:00 IST).
// Never closes shifts where endType == 'extended'.
// Scheduled at 19:00 IST (Asia/Kolkata) = 13:30 UTC.
// Wired as: Bun.cron("30 13 * * *", ...)

const CLOSE_HOUR = 19;
const CLOSE_MINUTE = 0;

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

async function run() {
  // C-16: cross-instance lock. Daily job keys by date.
  const runKey = new Date().toISOString().slice(0, 10);
  const got = await acquireLock("field-auto-close", runKey);
  if (!got) {
    console.warn(
      `[field-auto-close] lock already held for ${runKey}, skipping`
    );
    return;
  }

  const now = new Date();

  // Fetch active, non-extended shifts started more than 8 hours ago (bounded scan)
  const activeShifts = await prisma.shift.findMany({
    where: {
      status: "active",
      NOT: { endType: "extended" },
      startedAt: { lt: new Date(Date.now() - 8 * 60 * 60 * 1000) }
    },
    select: { id: true, agentId: true },
    take: 5000
  });

  if (activeShifts.length === 0) {
    // still sweep stale locks before returning
    await runDailySweep();
    return;
  }

  // Collect unique agentIds and look up ENABLED schedules in one query.
  // M-03: a disabled schedule must NOT participate in the close logic — fall
  // through to the no-schedule branch so the shift isn't auto-closed.
  const agentIds = [...new Set(activeShifts.map((s) => s.agentId))];

  const schedules = await prisma.shiftSchedule.findMany({
    where: { userId: { in: agentIds }, isEnabled: true },
    select: { userId: true, timezone: true }
  });

  const scheduleByAgent = new Map(schedules.map((s) => [s.userId, s]));

  const shiftIdsToClose: string[] = [];

  for (const shift of activeShifts) {
    const schedule = scheduleByAgent.get(shift.agentId) ?? null;

    if (schedule === null) {
      // No enabled schedule — apply old behavior: always close
      shiftIdsToClose.push(shift.id);
      continue;
    }

    // Has an enabled schedule — only close if local time >= 19:00
    const localTime = currentTimeInZone(schedule.timezone);
    const [localH, localM] = localTime.split(":").map(Number);
    const localMinutes = localH * 60 + localM;
    const closeMinutes = CLOSE_HOUR * 60 + CLOSE_MINUTE;

    if (localMinutes >= closeMinutes) {
      shiftIdsToClose.push(shift.id);
    }
  }

  if (shiftIdsToClose.length === 0) {
    console.log("[field-auto-close] no shifts eligible for closing at this time");
    await runDailySweep();
    return;
  }

  await prisma.shift.updateMany({
    where: {
      id: { in: shiftIdsToClose }
    },
    data: {
      endedAt: now,
      endType: "auto",
      status: "completed"
    }
  });

  console.log(
    `[field-auto-close] closed ${shiftIdsToClose.length} of ${activeShifts.length} active shift(s)`
  );

  await runDailySweep();
}

async function runDailySweep() {
  try {
    const swept = await sweepStaleLocks();
    if (swept > 0) {
      console.log(`[field-auto-close] swept ${swept} stale cron lock(s)`);
    }
  } catch (err) {
    console.error("[field-auto-close] stale-lock sweep failed:", err);
  }
}

export default run;

if (import.meta.main) {
  run()
    .then(() => {
      console.log("[field-auto-close] done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[field-auto-close] fatal:", err);
      process.exit(1);
    });
}
