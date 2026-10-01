import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { env } from "../../config/env.js";
import { encryptSecret, generateSecureToken, hashToken } from "../../utils/crypto.js";
import { webhookEventTypes, type CreateWebhookInput } from "./webhook.schemas.js";

const webhookSelect = {
  id: true,
  name: true,
  url: true,
  events: true,
  active: true,
  lastDeliveredAt: true,
  createdAt: true,
} as const;

type MessageWebhookEvent = Exclude<(typeof webhookEventTypes)[number], "contact.updated" | "conversation.updated" | "campaign.updated">;
type WebhookDatabase = Prisma.TransactionClient | typeof prisma;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function statusLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export async function enqueueMessageWebhook(messageId: string, eventType: MessageWebhookEvent, database: WebhookDatabase = prisma) {
  const message = await database.message.findUnique({
    where: { id: messageId },
    select: {
      id: true, workspaceId: true, metaMessageId: true, status: true, type: true, text: true, mediaUrl: true,
      sentAt: true, deliveredAt: true, readAt: true, failedAt: true, failureReason: true, payload: true,
      contact: { select: { id: true, name: true, phoneE164: true, email: true, userId: true } },
    },
  });
  if (!message) return 0;

  const endpoints = await database.webhookEndpoint.findMany({
    where: { workspaceId: message.workspaceId, active: true, events: { has: eventType } },
    select: { id: true },
  });
  if (!endpoints.length) return 0;

  const messagePayload = jsonRecord(message.payload);
  const callbackData = typeof messagePayload.callbackData === "string"
    ? messagePayload.callbackData
    : typeof messagePayload.clientReference === "string" ? messagePayload.clientReference : null;
  const eventId = `evt_${hashToken(`${message.id}:${eventType}`)}`;
  const timestamp = new Date().toISOString();
  const payload = {
    version: "1.0",
    id: eventId,
    timestamp,
    type: eventType,
    data: {
      customer: {
        id: message.contact.id,
        channel_phone_number: message.contact.phoneE164.replace(/\D/g, ""),
        traits: {
          name: message.contact.name,
          email: message.contact.email,
          user_id: message.contact.userId,
        },
      },
      message: {
        id: message.id,
        meta_message_id: message.metaMessageId,
        chat_message_type: "PublicApiMessage",
        channel_failure_reason: message.failureReason,
        message_status: statusLabel(message.status),
        status: message.status.toLowerCase(),
        received_at_utc: iso(message.sentAt),
        delivered_at_utc: iso(message.deliveredAt),
        seen_at_utc: iso(message.readAt),
        message_content_type: message.type,
        text: message.text,
        media_url: message.mediaUrl,
        meta_data: {
          source: "PublicMarento",
          source_data: { callback_data: callbackData },
        },
        callbackData,
      },
    },
  };

  const result = await database.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({
      endpointId: endpoint.id,
      workspaceId: message.workspaceId,
      messageId: message.id,
      eventId,
      eventType,
      payload,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

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
