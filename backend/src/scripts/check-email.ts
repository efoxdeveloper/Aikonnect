import { logger } from "../config/logger.js";
import { verifyEmailTransport } from "../services/email.service.js";

void verifyEmailTransport()
  .then((connected) => {
    if (!connected) throw new Error("SMTP is not configured");
    logger.info("SMTP connection and authentication check passed");
  })
  .catch((error) => {
    logger.error({ err: error }, "SMTP connection check failed");
    process.exitCode = 1;
  });
