import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { publishInboxRefresh } from "../../realtime/inbox.js";
import { prisma } from "../../database/prisma.js";
import { runAutomationsForEvent } from "../automations/automation.executor.js";
import { runWorkflowsForEvent } from "../workflows/workflow.executor.js";

type JsonRecord = Record<string, unknown>;

type WhatsAppMessage = JsonRecord & {
  id?: unknown;
  from?: unknown;
  to?: unknown;
  timestamp?: unknown;
  type?: unknown;
};

type WhatsAppStatus = JsonRecord & {
  id?: unknown;
  status?: unknown;
  timestamp?: unknown;
  errors?: unknown;
};

type WhatsAppChangeValue = JsonRecord & {
  metadata?: JsonRecord;
  messages?: unknown;
  statuses?: unknown;
  contacts?: unknown;
  state_sync?: unknown;
  message_echoes?: unknown;
  history?: unknown;
};

type WhatsAppWebhookPayload = JsonRecord & { entry?: unknown };

const router = Router();

const messageTypeMap = {
  text: "TEXT",
  image: "IMAGE",
  video: "VIDEO",
  audio: "AUDIO",
  document: "DOCUMENT",
  location: "LOCATION",
  contacts: "CONTACT",
  interactive: "INTERACTIVE",
} as const;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => item !== null) : [];
}

function webhookSignatureIsValid(rawBody: Buffer, signature: string, secret: string) {
  if (!signature.startsWith("sha256=")) return false;
  const received = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function messageSentAt(message: WhatsAppMessage) {
  const timestamp = Number(message.timestamp);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : new Date();
}

function messageType(message: WhatsAppMessage) {
  const type = asString(message.type);
  return type && type in messageTypeMap ? messageTypeMap[type as keyof typeof messageTypeMap] : "INTERACTIVE";
}

function messageDetails(message: WhatsAppMessage) {
  const type = asString(message.type);
  return type ? asRecord(message[type]) : null;
}

function messageText(message: WhatsAppMessage) {
  const details = messageDetails(message);
  return asString(details?.body) ?? asString(details?.caption);
}

function mediaId(message: WhatsAppMessage) {
  return asString(messageDetails(message)?.id);
}

async function workspacePhoneNumber(wabaId: string | undefined, phoneNumberId: string) {
  return prisma.whatsAppPhoneNumber.findFirst({
    where: {
      metaPhoneNumberId: phoneNumberId,
      ...(wabaId ? { businessAccount: { metaWabaId: wabaId } } : {}),
    },
    select: { id: true, displayPhoneNumber: true, businessAccount: { select: { workspaceId: true } } },
  });
}

async function ingestIncomingMessage(
  workspaceId: string,
  phoneNumberId: string,
  message: WhatsAppMessage,
  profileName: string | undefined,
) {
  const metaMessageId = asString(message.id);
  const from = asString(message.from);
  if (!metaMessageId || !from) return;

  const sentAt = messageSentAt(message);
  const text = messageText(message);
  const type = messageType(message);
  const normalizedPhone = from.startsWith("+") ? from : `+${from}`;
  const payload = JSON.parse(JSON.stringify(message)) as Prisma.InputJsonValue;

  return prisma.$transaction(async (transaction) => {
    const existingMessage = await transaction.message.findUnique({
      where: { workspaceId_metaMessageId: { workspaceId, metaMessageId } },
      select: { id: true },
    });
    if (existingMessage) return null;

    const existingContact = await transaction.contact.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [{ whatsappId: from }, { phoneE164: normalizedPhone }],
      },
      select: { id: true },
    });
    const contact = existingContact
      ? await transaction.contact.update({
          where: { id: existingContact.id },
          data: { ...(profileName ? { profileName, name: profileName } : {}), whatsappId: from, phoneE164: normalizedPhone, source: "WhatsApp" },
          select: { id: true },
        })
      : await transaction.contact.create({
          data: {
            workspaceId,
            name: profileName ?? normalizedPhone,
            phoneE164: normalizedPhone,
            whatsappId: from,
            profileName,
            source: "WhatsApp",
            whatsappOpted: true,
          },
          select: { id: true },
        });
    const conversation = await transaction.conversation.upsert({
      where: { workspaceId_contactId_channelKey: { workspaceId, contactId: contact.id, channelKey: "whatsapp" } },
      create: { workspaceId, contactId: contact.id, phoneNumberId, channelKey: "whatsapp", status: "OPEN" },
      update: { phoneNumberId },
      select: { id: true },
    });
    await transaction.message.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        contactId: contact.id,
        metaMessageId,
        direction: "INCOMING",
        type,
        status: "SENT",
        text,
        mediaId: mediaId(message),
        payload,
        sentAt,
      },
    });
    await transaction.conversation.update({
      where: { id: conversation.id },
      data: { lastMessagePreview: text ?? type, lastMessageAt: sentAt, unreadCount: { increment: 1 } },
    });
    return { contactId: contact.id, conversationId: conversation.id, messageId: metaMessageId, text, type, phoneNumber: normalizedPhone };
  });
}

async function ingestMessageEcho(workspaceId: string, phoneNumberId: string, message: WhatsAppMessage) {
  const metaMessageId = asString(message.id);
  const customer = asString(message.to);
  if (!metaMessageId || !customer) return;

  const sentAt = messageSentAt(message);
  const text = messageText(message);
  const type = messageType(message);
  const normalizedPhone = customer.startsWith("+") ? customer : `+${customer}`;
  const payload = JSON.parse(JSON.stringify(message)) as Prisma.InputJsonValue;

  return prisma.$transaction(async (transaction) => {
    const existingMessage = await transaction.message.findUnique({
      where: { workspaceId_metaMessageId: { workspaceId, metaMessageId } },
      select: { id: true },
    });
    if (existingMessage) return null;

    const existingContact = await transaction.contact.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [{ whatsappId: customer }, { phoneE164: normalizedPhone }],
      },
      select: { id: true },
    });
    const contact = existingContact
      ? await transaction.contact.update({
          where: { id: existingContact.id },
          data: { whatsappId: customer, phoneE164: normalizedPhone, source: "WhatsApp" },
          select: { id: true },
        })
      : await transaction.contact.create({
          data: { workspaceId, name: normalizedPhone, phoneE164: normalizedPhone, whatsappId: customer, source: "WhatsApp", whatsappOpted: true },
          select: { id: true },
        });
    const conversation = await transaction.conversation.upsert({
      where: { workspaceId_contactId_channelKey: { workspaceId, contactId: contact.id, channelKey: "whatsapp" } },
      create: { workspaceId, contactId: contact.id, phoneNumberId, channelKey: "whatsapp", status: "OPEN" },
      update: { phoneNumberId },
      select: { id: true },
    });
    await transaction.message.create({
      data: { workspaceId, conversationId: conversation.id, contactId: contact.id, metaMessageId, direction: "OUTGOING", type, status: "SENT", text, mediaId: mediaId(message), payload, sentAt },
    });
    await transaction.conversation.update({
      where: { id: conversation.id },
      data: { lastMessagePreview: text ?? type, lastMessageAt: sentAt },
    });
    return { contactId: contact.id, conversationId: conversation.id, messageId: metaMessageId };
  });
}

async function syncBusinessAppContacts(workspaceId: string, stateSync: JsonRecord[]) {
  for (const item of stateSync) {
    if (asString(item.type) !== "contact") continue;
    const contactData = asRecord(item.contact);
    const phone = asString(contactData?.phone_number);
    if (!phone) continue;
    const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`;
    const fullName = asString(contactData?.full_name) ?? asString(contactData?.first_name) ?? normalizedPhone;
    const action = asString(item.action);
    const existing = await prisma.contact.findFirst({
      where: { workspaceId, deletedAt: null, OR: [{ whatsappId: phone }, { phoneE164: normalizedPhone }] },
      select: { id: true },
    });
    if (action === "remove") {
      continue;
    }
    if (existing) {
      await prisma.contact.update({ where: { id: existing.id }, data: { name: fullName, profileName: fullName, whatsappId: phone, phoneE164: normalizedPhone, source: "WhatsApp", whatsappOpted: true } });
    } else {
      await prisma.contact.create({ data: { workspaceId, name: fullName, profileName: fullName, phoneE164: normalizedPhone, whatsappId: phone, source: "WhatsApp", whatsappOpted: true } });
    }
  }
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

async function ingestHistory(workspaceId: string, phoneNumberId: string, businessPhone: string, history: JsonRecord[]) {
  const businessDigits = digitsOnly(businessPhone);
  for (const chunk of history) {
    for (const thread of asArray(chunk.threads)) {
      const customer = asString(thread.id);
      if (!customer) continue;
      for (const historyMessage of asArray(thread.messages) as WhatsAppMessage[]) {
        const from = asString(historyMessage.from);
        const to = asString(historyMessage.to);
        const isBusinessMessage = Boolean(from && digitsOnly(from) === businessDigits);
        if (isBusinessMessage || (!from && to)) {
          await ingestMessageEcho(workspaceId, phoneNumberId, { ...historyMessage, to: to ?? customer });
        } else {
          await ingestIncomingMessage(workspaceId, phoneNumberId, { ...historyMessage, from: from ?? customer }, undefined);
        }
      }
    }
  }
}

async function ingestMessageStatuses(workspaceId: string, statuses: WhatsAppStatus[]) {
  for (const status of statuses) {
    const metaMessageId = asString(status.id);
    const state = asString(status.status)?.toUpperCase();
    if (!metaMessageId || !state || !["DELIVERED", "READ", "FAILED"].includes(state)) continue;
    const messageStatus = state as "DELIVERED" | "READ" | "FAILED";
    const timestamp = Number(status.timestamp);
    const occurredAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : new Date();
    const errors = asArray(status.errors);
    const failureReason = errors[0] ? asString(errors[0].title) ?? asString(errors[0].message) : undefined;
    await prisma.message.updateMany({
      where: { workspaceId, metaMessageId },
      data: {
        status: messageStatus,
        ...(state === "DELIVERED" ? { deliveredAt: occurredAt } : {}),
        ...(state === "READ" ? { deliveredAt: occurredAt, readAt: occurredAt } : {}),
        ...(state === "FAILED" ? { failedAt: occurredAt, failureReason } : {}),
      },
    });
  }
}

async function processPayload(payload: WhatsAppWebhookPayload) {
  for (const entry of asArray(payload.entry)) {
    const wabaId = asString(entry.id);
    for (const change of asArray(entry.changes)) {
      const field = asString(change.field);
      const value = asRecord(change.value) as WhatsAppChangeValue | null;
      if (!value) continue;
      const metadata = value.metadata;
      const phoneNumberId = asString(metadata?.phone_number_id);
      const account = wabaId ? await prisma.whatsAppBusinessAccount.findFirst({ where: { metaWabaId: wabaId }, select: { id: true, workspaceId: true, status: true } }) : null;
      if (field === "account_update") {
        if (account) {
          const eventName = asString(value.event) ?? asString(value.event_type);
          const disconnected = eventName === "PARTNER_REMOVED" || eventName === "DISCONNECTED";
          await prisma.whatsAppBusinessAccount.update({ where: { id: account.id }, data: { status: disconnected ? "ERROR" : "CONNECTED", lastSyncedAt: new Date(), ...(disconnected ? { lastError: eventName } : {}) } });
          if (disconnected) await prisma.whatsAppPhoneNumber.updateMany({ where: { businessAccountId: account.id }, data: { status: "DISCONNECTED" } });
        }
        continue;
      }
      if (field === "smb_app_state_sync") {
        if (account) await syncBusinessAppContacts(account.workspaceId, asArray(value.state_sync));
        continue;
      }
      if (field === "history") {
        if (phoneNumberId) {
          const phoneNumber = await workspacePhoneNumber(wabaId, phoneNumberId);
          if (phoneNumber) {
            await ingestHistory(phoneNumber.businessAccount.workspaceId, phoneNumber.id, phoneNumber.displayPhoneNumber, asArray(value.history));
          }
        }
        logger.info({ wabaId, phoneNumberId, historyItems: asArray(value.history).length }, "Processed WhatsApp coexistence history sync");
        continue;
      }
      if (!phoneNumberId) continue;
      const phoneNumber = await workspacePhoneNumber(wabaId, phoneNumberId);
      if (!phoneNumber) {
        logger.warn({ wabaId, phoneNumberId }, "Ignoring WhatsApp webhook for an unlinked phone number");
        continue;
      }
      if (field === "message_echoes" || field === "smb_message_echoes") {
        for (const echo of asArray(value.message_echoes) as WhatsAppMessage[]) {
          const result = await ingestMessageEcho(phoneNumber.businessAccount.workspaceId, phoneNumber.id, echo);
          if (result) publishInboxRefresh(phoneNumber.businessAccount.workspaceId, result.conversationId);
        }
        continue;
      }
      if (field !== "messages") continue;
      const contacts = asArray(value.contacts);
      const contactNames = new Map(contacts.map((contact) => [asString(contact.wa_id), asString(asRecord(contact.profile)?.name)]));
      for (const message of asArray(value.messages) as WhatsAppMessage[]) {
        const result = await ingestIncomingMessage(phoneNumber.businessAccount.workspaceId, phoneNumber.id, message, contactNames.get(asString(message.from)));
        if (result) {
          publishInboxRefresh(phoneNumber.businessAccount.workspaceId, result.conversationId);
          try {
            await runAutomationsForEvent(phoneNumber.businessAccount.workspaceId, "MESSAGE_RECEIVED", {
              contactId: result.contactId,
              conversationId: result.conversationId,
              message: { id: result.messageId, text: result.text, type: result.type, phoneNumber: result.phoneNumber },
              triggerPayload: { type: "MESSAGE_RECEIVED", messageId: result.messageId, text: result.text, messageType: result.type },
            });
            await runWorkflowsForEvent(phoneNumber.businessAccount.workspaceId, "MESSAGE_RECEIVED", {
              contactId: result.contactId,
              conversationId: result.conversationId,
              message: { id: result.messageId, text: result.text, type: result.type, phoneNumber: result.phoneNumber },
              triggerPayload: { type: "MESSAGE_RECEIVED", messageId: result.messageId, text: result.text, messageType: result.type },
            });
          } catch (error) {
            // Webhook acknowledgement must not be lost while a deployment is applying the automation migration.
            logger.error({ workspaceId: phoneNumber.businessAccount.workspaceId, error }, "Automation processing was skipped for the WhatsApp event");
          }
        }
      }
      await ingestMessageStatuses(phoneNumber.businessAccount.workspaceId, asArray(value.statuses) as WhatsAppStatus[]);
      if (asArray(value.statuses).length) publishInboxRefresh(phoneNumber.businessAccount.workspaceId);
    }
  }
}

router.get("/", (request: Request, response: Response) => {
  const mode = asString(request.query["hub.mode"]);
  const token = asString(request.query["hub.verify_token"]);
  const challenge = asString(request.query["hub.challenge"]);
  const configuredToken = env.META_WEBHOOK_VERIFY_TOKEN;
  if (!configuredToken || !challenge) return response.sendStatus(503);
  const tokensMatch = token !== undefined && token.length === configuredToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(configuredToken));
  if (mode !== "subscribe" || !tokensMatch) return response.sendStatus(403);
  return response.status(200).type("text/plain").send(challenge);
});

router.post("/", async (request: Request, response: Response) => {
  const secret = env.META_APP_SECRET;
  const signature = request.get("x-hub-signature-256");
  if (!secret || !request.rawBody || !signature || !webhookSignatureIsValid(request.rawBody, signature, secret)) {
    return response.sendStatus(401);
  }
  const payload = asRecord(request.body) as WhatsAppWebhookPayload | null;
  if (!payload || payload.object !== "whatsapp_business_account") return response.sendStatus(400);
  await processPayload(payload);
  return response.sendStatus(200);
});

export { router as whatsappWebhookRouter };
