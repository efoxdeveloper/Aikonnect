import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { generateSecureToken, hashToken } from "../../utils/crypto.js";
import type { CreateApiKeyInput } from "./api-key.schemas.js";

const apiKeySelect = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

function serializeApiKey(key: { id: string; name: string; keyPrefix: string; scopes: string[]; lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date }) {
  return key;
}

export async function listApiKeys(workspaceId: string) {
  const keys = await prisma.publicApiKey.findMany({
    where: { workspaceId },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    select: apiKeySelect,
  });
  return { items: keys.map(serializeApiKey) };
}

export async function createApiKey(workspaceId: string, createdById: string, input: CreateApiKeyInput) {
  const secret = `sk_live_${generateSecureToken(32)}`;
  const key = await prisma.publicApiKey.create({
    data: {
      workspaceId,
      createdById,
      name: input.name,
      keyPrefix: `${secret.slice(0, 16)}…`,
      keyHash: hashToken(secret),
      scopes: [...input.scopes],
    },
    select: apiKeySelect,
  });
  return { apiKey: serializeApiKey(key), secret };
}

export async function revokeApiKey(workspaceId: string, apiKeyId: string) {
  const existing = await prisma.publicApiKey.findFirst({ where: { id: apiKeyId, workspaceId }, select: { id: true, revokedAt: true } });
  if (!existing) throw new AppError(404, "API key was not found", "API_KEY_NOT_FOUND");
  if (existing.revokedAt) return;
  await prisma.publicApiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
}
