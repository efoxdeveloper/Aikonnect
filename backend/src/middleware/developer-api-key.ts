import type { RequestHandler } from "express";
import { prisma } from "../database/prisma.js";
import { AppError } from "./error-handler.js";
import { hashToken } from "../utils/crypto.js";

function suppliedKey(request: Parameters<RequestHandler>[0]) {
  const header = request.headers["x-api-key"]?.toString().trim();
  if (header) return header;
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return "";
}

export const authenticateDeveloperApiKey: RequestHandler = async (request, _response, next) => {
  try {
    const secret = suppliedKey(request);
    if (!secret || !secret.startsWith("sk_live_")) throw new AppError(401, "A valid developer API key is required", "API_KEY_REQUIRED");
    const key = await prisma.publicApiKey.findUnique({
      where: { keyHash: hashToken(secret) },
      select: { id: true, workspaceId: true, scopes: true, revokedAt: true, expiresAt: true },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) throw new AppError(401, "The developer API key is invalid or expired", "API_KEY_INVALID");
    request.developerApiKey = { id: key.id, workspaceId: key.workspaceId, scopes: key.scopes };
    void prisma.publicApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, "The developer API key is invalid", "API_KEY_INVALID"));
  }
};

export function requireDeveloperScope(scope: string): RequestHandler {
  return (request, _response, next) => {
    if (!request.developerApiKey?.scopes.includes(scope)) {
      next(new AppError(403, `The API key does not have the ${scope} scope`, "API_KEY_SCOPE_REQUIRED", { scope }));
      return;
    }
    next();
  };
}
