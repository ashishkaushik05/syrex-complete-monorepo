import { PrismaClient } from "@prisma/client";

// Raw Postgres sequences used outside Prisma's schema (e.g. formatted,
// shared counters like service complaint numbers) aren't declared in
// schema.prisma and aren't created by `prisma db push`. This project has
// no Prisma Migrate history (db push only), so there's nowhere in schema
// management for a one-time `CREATE SEQUENCE` to live — this script is
// that place. Run after every db:reset / db:test:prepare, since
// --force-reset drops these along with everything else.
const SEQUENCES = ["service_complaint_number_seq"];

const prisma = new PrismaClient();

async function main() {
  for (const name of SEQUENCES) {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${name}`);
    console.log(`[ensure-sequences] ensured ${name}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
