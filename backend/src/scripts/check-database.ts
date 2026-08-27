import { logger } from "../config/logger.js";
import { checkDatabaseConnection, closeDatabaseConnection } from "../database/prisma.js";

async function main(): Promise<void> {
  try {
    const result = await checkDatabaseConnection();
    logger.info(
      {
        connected: true,
        database: result.database,
        user: result.user,
        serverTime: result.serverTime,
      },
      "PostgreSQL connection test passed",
    );
  } finally {
    await closeDatabaseConnection();
  }
}

void main().catch((error) => {
  logger.error({ err: error }, "PostgreSQL connection test failed");
  process.exitCode = 1;
});
