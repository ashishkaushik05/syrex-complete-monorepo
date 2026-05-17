import { prisma } from "../infra/db/prisma";

// Closes active shifts respecting each agent's timezone.
// For agents WITH a shiftSchedule: only close if local time >= 19:00.
// For agents WITHOUT a shiftSchedule: close unconditionally (cron fires at 19:00 IST).
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
  const now = new Date();

  // Fetch all active, non-extended shifts with their agentId
  const activeShifts = await prisma.shift.findMany({
    where: {
      status: "active",
      NOT: { endType: "extended" }
    },
    select: { id: true, agentId: true }
  });

  if (activeShifts.length === 0) return;

  // Collect unique agentIds and look up their schedules in one query
  const agentIds = [...new Set(activeShifts.map((s) => s.agentId))];

  const schedules = await prisma.shiftSchedule.findMany({
    where: { userId: { in: agentIds } },
    select: { userId: true, timezone: true }
  });

  const scheduleByAgent = new Map(schedules.map((s) => [s.userId, s]));

  const shiftIdsToClose: string[] = [];

  for (const shift of activeShifts) {
    const schedule = scheduleByAgent.get(shift.agentId) ?? null;

    if (schedule === null) {
      // No schedule — apply old behavior: always close
      shiftIdsToClose.push(shift.id);
      continue;
    }

    // Has a schedule — only close if local time >= 19:00
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
