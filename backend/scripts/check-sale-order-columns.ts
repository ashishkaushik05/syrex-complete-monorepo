import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_orders'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rows.map(r => r.column_name)));
}

main().finally(async () => prisma.$disconnect());
