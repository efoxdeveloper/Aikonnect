import { createServer } from "node:http";
import { app } from "./app.js";
import { configureNetworkResolution } from "./config/network.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { checkDatabaseConnection, closeDatabaseConnection } from "./database/prisma.js";

// Meta advertises IPv6 and IPv4 endpoints. Some Windows hosts resolve IPv6 first
// even when their IPv6 route is unavailable, causing fetch() to hang until timeout.
configureNetworkResolution();

const server = createServer(app);
let shuttingDown = false;

async function startServer(): Promise<void> {
  const database = await checkDatabaseConnection();
  logger.info(
    { database: database.database, databaseUser: database.user },
    "PostgreSQL connection established",
  );

  server.listen(env.PORT, env.HOST, () => {
    logger.info(
      { host: env.HOST, port: env.PORT, apiPrefix: env.API_PREFIX },
      "Interakt API is listening",
    );
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  const forceShutdown = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forceShutdown.unref();

  server.close(async (serverError) => {
    try {
      await closeDatabaseConnection();
      clearTimeout(forceShutdown);

      if (serverError) {
        logger.error({ err: serverError }, "HTTP server failed to close cleanly");
        process.exit(1);
      }

      logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Database pool failed to close cleanly");
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("SIGTERM");
});

void startServer().catch(async (error) => {
  logger.fatal({ err: error }, "API startup failed");
  await closeDatabaseConnection().catch(() => undefined);
  process.exit(1);
});
