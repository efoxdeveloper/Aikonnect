import type { ErrorRequestHandler, RequestHandler } from "express";
import { env } from "../config/env.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "APPLICATION_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, `Route ${request.method} ${request.originalUrl} was not found`, "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({ success: false, error: { code: "REQUEST_TOO_LARGE", message: "The uploaded file is too large." } });
    return;
  }
  const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : undefined;
  const mappedPrismaError =
    prismaCode === "P2002"
      ? new AppError(409, "A record with these details already exists", "RECORD_CONFLICT")
      : prismaCode === "P2025"
        ? new AppError(404, "The requested record was not found", "RECORD_NOT_FOUND")
        : undefined;
  const applicationError = error instanceof AppError ? error : mappedPrismaError;
  const statusCode = applicationError?.statusCode ?? 500;
  const code = applicationError?.code ?? "INTERNAL_SERVER_ERROR";
  const message = applicationError?.message ?? "An unexpected error occurred";

  request.log.error({ err: error, statusCode }, "Request failed");

  response.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(applicationError?.details ? { details: applicationError.details } : {}),
      ...(env.NODE_ENV === "development" && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
    requestId: request.id,
  });
};
