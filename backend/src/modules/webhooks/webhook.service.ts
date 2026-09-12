import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { env } from "../../config/env.js";
import { encryptSecret, generateSecureToken } from "../../utils/crypto.js";
import type { CreateWebhookInput } from "./webhook.schemas.js";

const webhookSelect = {
  id: true,
  name: true,
  url: true,
  events: true,
  active: true,
  lastDeliveredAt: true,
  createdAt: true,
} as const;

export async function listWebhooks(workspaceId: string) {
  const items = await prisma.webhookEndpoint.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: webhookSelect });
  return { items };
}

export async function createWebhook(workspaceId: string, createdById: string, input: CreateWebhookInput) {
  const secret = `whsec_${generateSecureToken(32)}`;
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      workspaceId,
      createdById,
      name: input.name,
      url: input.url,
      events: [...input.events],
      secretEncrypted: encryptSecret(secret, env.ACCESS_TOKEN_SECRET),
    },
    select: webhookSelect,
  });
  return { webhook: endpoint, secret };
}

export async function deleteWebhook(workspaceId: string, webhookId: string) {
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id: webhookId, workspaceId }, select: { id: true } });
  if (!existing) throw new AppError(404, "Webhook endpoint was not found", "WEBHOOK_NOT_FOUND");
  await prisma.webhookEndpoint.delete({ where: { id: existing.id } });
}
