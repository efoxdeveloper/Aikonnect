import type { RequestHandler } from "express";
import { prisma } from "../database/prisma.js";
import { AppError } from "./error-handler.js";
import { requireAuth } from "./authenticate.js";

export type PlatformRole = "SUPPORT" | "OPERATIONS" | "BILLING" | "ADMIN" | "SUPER_ADMIN";

export function requirePlatformRole(...allowedRoles: PlatformRole[]): RequestHandler {
  return async (request, _response, next) => {
    try {
      const auth = requireAuth(request);
      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { status: true, emailVerifiedAt: true, platformRole: true },
      });

      if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt) {
        throw new AppError(401, "The account is no longer active", "ACCOUNT_INACTIVE");
      }
      if (user.platformRole === "NONE" || !allowedRoles.includes(user.platformRole as PlatformRole)) {
        throw new AppError(403, "Platform administrator access is required", "PLATFORM_ACCESS_DENIED");
      }

      request.platformAccess = { role: user.platformRole as PlatformRole };
      next();
    } catch (error) {
      next(error);
    }
  };
}
