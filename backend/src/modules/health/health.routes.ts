import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { checkDatabaseConnection } from "../../database/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    success: true,
    data: {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_request, response) => {
    const database = await checkDatabaseConnection();

    response.status(200).json({
      success: true,
      data: {
        status: "ready",
        database: {
          connected: true,
          name: database.database,
          serverTime: database.serverTime,
        },
      },
    });
  }),
);
