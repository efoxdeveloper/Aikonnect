import rateLimit, { type Options } from "express-rate-limit";

export const defaultRateLimitConfig = {
  windowMs: 5 * 60 * 1000,
  limit: 500,
} as const;

export function createRateLimiter(options: Pick<Options, "windowMs" | "limit"> = defaultRateLimitConfig) {
  return rateLimit({
    ...options,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
}
