import type { RequestHandler } from "express";
import { prisma } from "../database/prisma.js";
import { AppError } from "./error-handler.js";
import { verifyAccessToken } from "../utils/tokens.js";

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
    }

    const payload = await verifyAccessToken(authorization.slice(7));
    const session = await prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
      },
      select: { id: true, user: { select: { id: true, email: true, emailVerifiedAt: true } } },
    });

    if (!session) throw new AppError(401, "The session is no longer active", "SESSION_INVALID");
    request.auth = {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      emailVerifiedAt: session.user.emailVerifiedAt,
    };
    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError(401, "The access token is invalid or expired", "ACCESS_TOKEN_INVALID"),
    );
  }
};

export const requireVerifiedEmail: RequestHandler = (request, _response, next) => {
  try {
    const auth = requireAuth(request);
    if (!auth.emailVerifiedAt) {
      throw new AppError(
        403,
        "Verify your email before accessing a workspace",
        "EMAIL_VERIFICATION_REQUIRED",
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};

export function requireAuth(request: Express.Request) {
  if (!request.auth) throw new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return request.auth;
}
