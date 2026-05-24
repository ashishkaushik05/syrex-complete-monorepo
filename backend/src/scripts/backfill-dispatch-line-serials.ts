/**
 * One-time backfill: populate dispatch_line_serials from existing dispatch_lines.
 * Safe to re-run (skipDuplicates). Run before deploying the SS-002 fix to production.
 *
 * Usage: cd backend && bun src/scripts/backfill-dispatch-line-serials.ts
 */

import { PrismaClient } from "@prisma/client";
import { normalizeSerial, parseSerialNumbers } from "../trpc/routes/service-shared";

const prisma = new PrismaClient();

async function backfill() {
  const BATCH_SIZE = 500;
  let skip = 0;
  let totalLines = 0;
  let totalSerials = 0;

  while (true) {
    const lines = await prisma.dispatchLine.findMany({
      select: { id: true, serialNumbers: true },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    });

    if (lines.length === 0) break;

    const toCreate: Array<{ dispatchLineId: string; normalizedSerial: string }> = [];
    for (const line of lines) {
      for (const serial of parseSerialNumbers(line.serialNumbers)) {
        const ns = normalizeSerial(serial);
        if (ns) toCreate.push({ dispatchLineId: line.id, normalizedSerial: ns });
      }
    }

    if (toCreate.length > 0) {
      const result = await prisma.dispatchLineSerial.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      totalSerials += result.count;
    }

    totalLines += lines.length;
    skip += BATCH_SIZE;
    console.log(`Processed ${totalLines} dispatch lines, created ${totalSerials} serial entries...`);
  }

  console.log(`Done. ${totalLines} lines processed, ${totalSerials} serial entries created.`);
}

if (import.meta.main) {
  backfill()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
