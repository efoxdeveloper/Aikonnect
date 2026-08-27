import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "./error-handler.js";

export function validateBody(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(new AppError(422, "Request validation failed", "VALIDATION_ERROR", result.error.flatten()));
      return;
    }

    request.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      next(new AppError(422, "Query validation failed", "VALIDATION_ERROR", result.error.flatten()));
      return;
    }

    request.validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      next(new AppError(422, "Route parameter validation failed", "VALIDATION_ERROR", result.error.flatten()));
      return;
    }

    next();
  };
}
