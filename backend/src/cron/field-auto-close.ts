import { prisma } from "../infra/db/prisma";

// Closes all active shifts where endType != 'extended'.
// Scheduled at 19:00 IST (Asia/Kolkata) = 13:30 UTC.
// Wired as: Bun.cron("30 13 * * *", ...)

async function run() {
  const now = new Date();

  const activeShifts = await prisma.shift.findMany({
    where: {
      status: "active",
      NOT: { endType: "extended" }
    },
    select: { id: true }
  });

  if (activeShifts.length === 0) return;

  await prisma.shift.updateMany({
    where: {
      id: { in: activeShifts.map((s) => s.id) }
    },
    data: {
      endedAt: now,
      endType: "auto",
      status: "completed"
    }
  });

  console.log(`[field-auto-close] closed ${activeShifts.length} shift(s)`);
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
