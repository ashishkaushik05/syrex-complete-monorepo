import { prisma } from "../infra/db/prisma";

/**
 * Acquire a cron lock by inserting a (jobName, runKey) row. Returns true if
 * acquired, false if the unique constraint already holds — i.e. another instance
 * already started this run. Callers MUST treat `false` as "skip the run".
 *
 * runKey conventions:
 *   - daily jobs:        new Date().toISOString().slice(0, 10)        // "YYYY-MM-DD"
 *   - per-minute jobs:   new Date().toISOString().slice(0, 16)        // "YYYY-MM-DDTHH:MM"
 */
export async function acquireLock(
  jobName: string,
  runKey: string
): Promise<boolean> {
  try {
    await prisma.cronLock.create({ data: { jobName, runKey } });
    return true;
  } catch {
    // P2002 unique violation = lock already held by another instance
    return false;
  }
}

/**
 * Sweep cron-lock rows older than 7 days. Returns the number deleted.
 * Safe to call from a daily cron or a startup hook.
 */
export async function sweepStaleLocks(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const res = await prisma.cronLock.deleteMany({
    where: { lockedAt: { lt: cutoff } }
  });
  return res.count;
}
