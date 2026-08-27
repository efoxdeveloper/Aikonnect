import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}

export async function checkDatabaseConnection(): Promise<{
  database: string;
  user: string;
  serverTime: string;
}> {
  const rows = await prisma.$queryRaw<
    Array<{ database: string; user: string; server_time: Date }>
  >`SELECT current_database() AS database, current_user AS user, NOW() AS server_time`;
  const row = rows[0];

  if (!row) throw new Error("PostgreSQL connectivity check returned no rows");

  return {
    database: row.database,
    user: row.user,
    serverTime: row.server_time.toISOString(),
  };
}

export async function closeDatabaseConnection(): Promise<void> {
  await prisma.$disconnect();
}
