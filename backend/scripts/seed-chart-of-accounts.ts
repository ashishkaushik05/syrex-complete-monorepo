// Seeds the battery-distributor Chart of Accounts. Idempotent (upsert by code).
// Called from demo-seed.ts and runnable standalone:  bun run scripts/seed-chart-of-accounts.ts
import { PrismaClient } from "@prisma/client";
import { CHART_OF_ACCOUNTS_TEMPLATE } from "../src/accounts/chart-of-accounts";

export async function seedChartOfAccounts(prisma: PrismaClient): Promise<void> {
  // Template is ordered parents-before-children, so each parentCode is already
  // present in idByCode by the time a child references it.
  const idByCode = new Map<string, string>();
  for (const acc of CHART_OF_ACCOUNTS_TEMPLATE) {
    const parentId = acc.parentCode ? idByCode.get(acc.parentCode) ?? null : null;
    const row = await prisma.ledgerAccount.upsert({
      where: { code: acc.code },
      create: {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId,
        isPostable: acc.isPostable,
        isActive: true,
      },
      update: { name: acc.name, type: acc.type, parentId, isPostable: acc.isPostable },
      select: { id: true },
    });
    idByCode.set(acc.code, row.id);
  }
}

if (import.meta.main) {
  const prisma = new PrismaClient();
  seedChartOfAccounts(prisma)
    .then(() => {
      console.log(`[seed] chart of accounts: ${CHART_OF_ACCOUNTS_TEMPLATE.length} accounts upserted`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
