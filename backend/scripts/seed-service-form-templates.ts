import { PrismaClient } from "@prisma/client";
import { installBatteryWarrantyTemplate } from "../src/service/battery-warranty-template";

const prisma = new PrismaClient();

async function main() {
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) throw new Error("DEFAULT_ORG_ID must be configured");

  const creator = await prisma.user.findUnique({
    where: { email: "admin@syrex.local" },
    select: { id: true },
  });
  const result = await installBatteryWarrantyTemplate(prisma, {
    orgId,
    createdById: creator?.id ?? null,
  });
  console.log(JSON.stringify({ seeded: true, ...result }, null, 2));
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
