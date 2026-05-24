import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; udt_name: string }>>(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rows, null, 2));
}

main().finally(async () => prisma.$disconnect());
