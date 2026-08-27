import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: process.env.NODE_TEST_CONTEXT ? "silent" : env.LOG_LEVEL,
  base: {
    service: "interakt-api",
    environment: env.NODE_ENV,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "newPassword",
      "currentPassword",
      "token",
      "refreshToken",
      "DB_PASSWORD",
      "DATABASE_URL",
      "SMTP_PASSWORD",
    ],
    censor: "[REDACTED]",
  },
});
