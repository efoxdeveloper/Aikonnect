import { randomUUID } from "node:crypto";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Request } from "express";
import { pinoHttp } from "pino-http";
import { corsOrigins, env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { whatsappWebhookRouter } from "./modules/whatsapp/webhook.routes.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.set("trust proxy", env.TRUST_PROXY);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    genReqId(request, response) {
      const requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    },
  }),
);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'", "https://connect.facebook.net"],
        "script-src-elem": ["'self'", "https://connect.facebook.net"],
        "connect-src": ["'self'", "https://graph.facebook.com", "https://connect.facebook.net"],
        "frame-src": ["'self'", "https://www.facebook.com", "https://web.facebook.com"],
        "child-src": ["'self'", "https://www.facebook.com", "https://web.facebook.com"],
        "img-src": ["'self'", "data:", "blob:", "https://*.facebook.com", "https://*.fbcdn.net"],
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(cookieParser());
app.use(
  express.json({
    limit: "4mb",
    verify(request, _response, buffer) {
      (request as Request).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.get("/", (_request, response) => {
  response.status(200).json({
    success: true,
    data: { service: "Interakt API", version: "0.1.0" },
  });
});
app.use("/api/webhooks/whatsapp", whatsappWebhookRouter);
app.use(env.API_PREFIX, apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
