import { PrismaClient } from "@prisma/client";
import { logger } from "../logger";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (Bun.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

logger.info("Prisma client initialized");
