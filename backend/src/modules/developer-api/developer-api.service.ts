import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { hashToken } from "../../utils/crypto.js";
import { reserveMessageBilling, releaseMessageBilling } from "../billing/billing.service.js";
import { resolveMessagePricing, type PricingSnapshot, messagePricingSnapshot } from "../whatsapp-pricing/pricing.service.js";
import { sendWhatsAppAudioMessage, sendWhatsAppDocumentMessage, sendWhatsAppImageMessage, sendWhatsAppInteractiveButtonMessage, sendWhatsAppStickerMessage, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage, sendWhatsAppVideoMessage, type WhatsAppTemplateParameter } from "../whatsapp/whatsapp.service.js";
import { publicMessageSchema, type PublicMessageInput, type PublicTextMessageInput, type SendMessageInput } from "./developer-api.schemas.js";

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return `+${digits}`;
}

function fixed(value: Prisma.Decimal | null | undefined) {
  return value?.toFixed(6) ?? null;
}

export async function serializeMessage(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true, metaMessageId: true, status: true, billingStatus: true, billingMode: true,
      billingCurrency: true, metaCost: true, platformFee: true, customerCost: true,
      walletChargeAmount: true, pricingCategory: true, pricingType: true, payload: true,
    },
  });
  if (!message) throw new AppError(404, "The message was not found", "MESSAGE_NOT_FOUND");
  const reservation = await prisma.walletReservation.findUnique({ where: { messageId }, select: { status: true, walletChargeAmount: true, currency: true } });
  return {
    messageId: message.id,
    metaMessageId: message.metaMessageId,
    clientReference: message.payload && typeof message.payload === "object" && !Array.isArray(message.payload) && typeof (message.payload as Record<string, unknown>).clientReference === "string" ? (message.payload as Record<string, unknown>).clientReference : null,
    status: message.status.toLowerCase(),
    billing: {
      currency: message.billingCurrency ?? reservation?.currency ?? null,
      estimatedMetaCost: fixed(message.metaCost),
      platformFee: fixed(message.platformFee),
      customerCost: fixed(message.customerCost),
      reservedAmount: fixed(message.walletChargeAmount ?? reservation?.walletChargeAmount),
      status: reservation?.status === "ACTIVE" ? "RESERVED" : message.billingStatus,
    },
  };
}

function publicMessageKey(workspaceId: string, input: PublicMessageInput, to: string) {
  return `public:${hashToken(JSON.stringify({ workspaceId, to, callbackData: input.callbackData, userId: input.userId ?? null, type: input.type, data: input.data }))}`;
}

function publicMessageText(input: PublicMessageInput) {
  if (input.type === "Text") return input.data.message;
  if (input.type === "InteractiveButton") return input.data.message.body.text;
  if (input.type === "Sticker") return undefined;
  return input.data.message;
}

async function findExisting(workspaceId: string, idempotencyKey: string) {
  const message = await prisma.message.findUnique({ where: { workspaceId_apiIdempotencyKey: { workspaceId, apiIdempotencyKey: idempotencyKey } }, select: { id: true } });
  return message ? { replayed: true, data: await serializeMessage(message.id) } : null;
}

function templateParameters(values: string[]): WhatsAppTemplateParameter[] {
  return values.map((text) => ({ type: "text", text }));
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function sendTemplateMessage(workspaceId: string, input: SendMessageInput, idempotencyKey: string) {
  const existing = await findExisting(workspaceId, idempotencyKey);
  if (existing) return existing;
  const to = normalizedPhone(input.to);
  const template = await prisma.template.findFirst({
    where: { workspaceId, templateKey: input.templateKey, status: "APPROVED", deletedAt: null },
    select: { id: true, templateKey: true, category: true, body: true, metaTemplateName: true, metaLanguageCode: true, language: true },
  });
  if (!template) throw new AppError(422, "The approved WhatsApp template was not found", "TEMPLATE_NOT_FOUND");
  if (!template.metaTemplateName) throw new AppError(422, "The template is missing its Meta template name", "TEMPLATE_NOT_READY");

  const pricing = await resolveMessagePricing({ phoneNumber: to, category: template.category, pricingType: input.pricingType, currentVolume: input.currentVolume ? BigInt(input.currentVolume) : undefined });
  const languageCode = input.languageCode ?? template.metaLanguageCode ?? template.language;
  if (!languageCode) throw new AppError(422, "The template is missing its language code", "TEMPLATE_NOT_READY");

  let created: { messageId: string; conversationId: string };
  try {
    created = await prisma.$transaction(async (transaction) => {
      const existingContact = await transaction.contact.findFirst({ where: { workspaceId, phoneE164: to, deletedAt: null }, select: { id: true, whatsappOpted: true, marketingBlocked: true } });
      if (existingContact && (!existingContact.whatsappOpted || existingContact.marketingBlocked)) throw new AppError(422, "The recipient is not eligible for WhatsApp messaging", "CONTACT_NOT_WHATSAPP_ELIGIBLE");
      const contact = existingContact ?? await transaction.contact.create({ data: { workspaceId, name: to, phoneE164: to, source: "Developer API", status: "New Lead", whatsappOpted: true, whatsappOptInSource: "Developer API", whatsappOptedInAt: new Date(), customAttributes: {} }, select: { id: true } });
      if (!existingContact) await transaction.contactConsentEvent.create({ data: { workspaceId, contactId: contact.id, type: "OPT_IN", source: "Developer API", occurredAt: new Date() } });
      const conversation = await transaction.conversation.upsert({ where: { workspaceId_contactId_channelKey: { workspaceId, contactId: contact.id, channelKey: "whatsapp" } }, create: { workspaceId, contactId: contact.id, channelKey: "whatsapp", status: "OPEN" }, update: { deletedAt: null }, select: { id: true } });
      const message = await transaction.message.create({ data: { workspaceId, conversationId: conversation.id, contactId: contact.id, direction: "OUTGOING", type: "TEXT", status: "QUEUED", text: template.body, apiIdempotencyKey: idempotencyKey, ...messagePricingSnapshot(pricing), payload: { source: "developer_api", templateKey: template.templateKey, clientReference: input.clientReference ?? null }, sentAt: new Date() }, select: { id: true } });
      return { messageId: message.id, conversationId: conversation.id };
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const replay = await findExisting(workspaceId, idempotencyKey);
      if (replay) return replay;
    }
    throw error;
  }

  let reservationId: string | null = null;
  let billingResolved = false;
  let metaAccepted: { metaMessageId: string; phoneNumberId: string; sentAt: Date } | null = null;
  try {
    const billing = await reserveMessageBilling({ workspaceId, messageId: created.messageId, pricing, clientReference: input.clientReference, idempotencyKey: `developer:${workspaceId}:${hashToken(idempotencyKey)}` });
    billingResolved = true;
    reservationId = billing.reservation?.id ?? null;
    metaAccepted = await sendWhatsAppTemplateMessage(workspaceId, to, template.metaTemplateName, languageCode, templateParameters(input.parameters), idempotencyKey);
    await prisma.$transaction(async (transaction) => {
      await transaction.message.update({ where: { id: created.messageId }, data: { metaMessageId: metaAccepted!.metaMessageId, status: "SENT", sentAt: metaAccepted!.sentAt } });
      await transaction.conversation.update({ where: { id: created.conversationId }, data: { lastMessagePreview: `You: ${template.body}`, lastMessageAt: metaAccepted!.sentAt, phoneNumberId: metaAccepted!.phoneNumberId } });
    });
    return { replayed: false, data: { ...(await serializeMessage(created.messageId)), clientReference: input.clientReference ?? null, billing: billing.billing } };
  } catch (error) {
    if (reservationId && !metaAccepted) await releaseMessageBilling(created.messageId, error instanceof Error ? error.message : "Meta rejected the message").catch(() => undefined);
    await prisma.message.update({ where: { id: created.messageId }, data: metaAccepted
      ? { metaMessageId: metaAccepted.metaMessageId, status: "SENT", sentAt: metaAccepted.sentAt, billingError: "Meta accepted the message but the response could not be persisted" }
      : { status: "FAILED", failedAt: new Date(), failureReason: error instanceof Error ? error.message : "Developer API send failed", billingStatus: reservationId ? "RELEASED" : billingResolved ? "NOT_APPLICABLE" : "BILLING_ERROR", billingError: error instanceof Error ? error.message : "Developer API billing/send failed" } }).catch(() => undefined);
    throw error;
  }
}

export async function sendPublicMessage(workspaceId: string, input: PublicMessageInput) {
  const to = normalizedPhone(input.fullPhoneNumber);
  const idempotencyKey = publicMessageKey(workspaceId, input, to);
  const existing = await findExisting(workspaceId, idempotencyKey);
  if (existing) {
    return { replayed: true, data: { ...existing.data, userId: input.userId ?? null, callbackData: input.callbackData ?? null } };
  }

  const pricing = await resolveMessagePricing({ phoneNumber: to, category: "UTILITY", pricingType: "REGULAR" });
  let created: { messageId: string; conversationId: string };
  try {
    created = await prisma.$transaction(async (transaction) => {
      const existingContact = await transaction.contact.findFirst({
        where: { workspaceId, phoneE164: to, deletedAt: null },
        select: { id: true, whatsappOpted: true, marketingBlocked: true },
      });
      if (existingContact && (!existingContact.whatsappOpted || existingContact.marketingBlocked)) {
        throw new AppError(422, "The recipient is not eligible for WhatsApp messaging", "CONTACT_NOT_WHATSAPP_ELIGIBLE");
      }
      const contact = existingContact ?? await transaction.contact.create({
        data: {
          workspaceId,
          name: input.userId ?? to,
          phoneE164: to,
          userId: input.userId ?? null,
          source: "Public API",
          status: "New Lead",
          whatsappOpted: true,
          whatsappOptInSource: "Public API",
          whatsappOptedInAt: new Date(),
          customAttributes: {},
        },
        select: { id: true },
      });
      if (!existingContact) {
        await transaction.contactConsentEvent.create({ data: { workspaceId, contactId: contact.id, type: "OPT_IN", source: "Public API", occurredAt: new Date() } });
      }
      const conversation = await transaction.conversation.upsert({
        where: { workspaceId_contactId_channelKey: { workspaceId, contactId: contact.id, channelKey: "whatsapp" } },
        create: { workspaceId, contactId: contact.id, channelKey: "whatsapp", status: "OPEN" },
        update: { deletedAt: null },
        select: { id: true },
      });
      const message = await transaction.message.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          contactId: contact.id,
          direction: "OUTGOING",
          type: input.type === "Image" ? "IMAGE" : input.type === "Document" ? "DOCUMENT" : input.type === "Video" ? "VIDEO" : input.type === "Audio" ? "AUDIO" : input.type === "InteractiveButton" ? "INTERACTIVE" : input.type === "Sticker" ? "STICKER" : "TEXT",
          status: "QUEUED",
          text: publicMessageText(input) ?? null,
          mediaUrl: input.type === "Text" || input.type === "InteractiveButton" ? null : input.data.mediaUrl,
          apiIdempotencyKey: idempotencyKey,
          ...messagePricingSnapshot(pricing),
          payload: {
            source: "public_api",
            request: input,
            userId: input.userId ?? null,
            callbackData: input.callbackData ?? null,
            clientReference: input.callbackData ?? null,
            messageType: input.type,
            ...(input.type !== "Text" && input.type !== "InteractiveButton" ? { mediaUrl: input.data.mediaUrl } : {}),
            ...((input.type === "Document" || input.type === "Video" || input.type === "Audio") && input.data.fileName ? { fileName: input.data.fileName } : {}),
            ...(input.type === "InteractiveButton" ? { interactive: input.data.message } : {}),
          },
          sentAt: new Date(),
        },
        select: { id: true },
      });
      return { messageId: message.id, conversationId: conversation.id };
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const replay = await findExisting(workspaceId, idempotencyKey);
      if (replay) return { replayed: true, data: { ...replay.data, userId: input.userId ?? null, callbackData: input.callbackData ?? null } };
    }
    throw error;
  }

  try {
    const billing = await reserveMessageBilling({ workspaceId, messageId: created.messageId, pricing, clientReference: input.callbackData, idempotencyKey: `public:${workspaceId}:${hashToken(idempotencyKey)}` });
    return { replayed: false, data: { ...(await serializeMessage(created.messageId)), userId: input.userId ?? null, callbackData: input.callbackData ?? null, billing: billing.billing } };
  } catch (error) {
    await prisma.message.update({ where: { id: created.messageId }, data: { status: "FAILED", failedAt: new Date(), failureReason: error instanceof Error ? error.message : "Public API billing failed", billingStatus: "BILLING_ERROR", billingError: error instanceof Error ? error.message : "Public API billing failed" } }).catch(() => undefined);
    throw error;
  }
}

type QueuedPublicMessage = {
  id: string;
  workspaceId: string;
  conversationId: string;
  status: string;
  queueProcessingToken: string | null;
  payload: unknown;
  rateCardId: string | null;
  pricingCountry: string | null;
  pricingCategory: string | null;
  pricingType: string | null;
  metaCost: Prisma.Decimal | null;
  platformFee: Prisma.Decimal | null;
  customerCost: Prisma.Decimal | null;
  pricingCurrency: string | null;
  pricingEffectiveDate: Date | null;
};

function queuedPublicInput(payload: unknown) {
  const request = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).request : undefined;
  const parsed = publicMessageSchema.safeParse(request);
  if (!parsed.success) throw new AppError(500, "The queued public message payload is invalid", "PUBLIC_MESSAGE_QUEUE_PAYLOAD_INVALID");
  return parsed.data;
}

function pricingFromMessage(message: QueuedPublicMessage): PricingSnapshot {
  if (!message.rateCardId || !message.pricingCountry || !message.pricingCategory || !message.pricingType || !message.metaCost || !message.platformFee || !message.customerCost || !message.pricingCurrency || !message.pricingEffectiveDate) {
    throw new AppError(500, "The queued public message is missing its pricing snapshot", "PUBLIC_MESSAGE_PRICING_MISSING");
  }
  return {
    rateCardId: message.rateCardId,
    countryCode: message.pricingCountry,
    countryName: message.pricingCountry,
    category: message.pricingCategory,
    pricingType: message.pricingType,
    metaRate: message.metaCost.toFixed(6),
    platformFee: message.platformFee.toFixed(6),
    customerRate: message.customerCost.toFixed(6),
    currency: message.pricingCurrency,
    effectiveFrom: message.pricingEffectiveDate.toISOString().slice(0, 10),
  };
}

export async function deliverPublicMessage(messageId: string, queueProcessingToken: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true, workspaceId: true, conversationId: true, status: true, queueProcessingToken: true,
      payload: true, rateCardId: true, pricingCountry: true, pricingCategory: true, pricingType: true,
      metaCost: true, platformFee: true, customerCost: true, pricingCurrency: true, pricingEffectiveDate: true,
    },
  });
  if (!message || message.status !== "QUEUED" || message.queueProcessingToken !== queueProcessingToken) return false;

  const input = queuedPublicInput(message.payload);
  const to = normalizedPhone(input.fullPhoneNumber);
  const pricing = pricingFromMessage(message);
  let metaAccepted: { metaMessageId: string; phoneNumberId: string; sentAt: Date } | null = null;
  try {
    await reserveMessageBilling({ workspaceId: message.workspaceId, messageId: message.id, pricing, clientReference: input.callbackData, idempotencyKey: `public:${message.workspaceId}:${hashToken(publicMessageKey(message.workspaceId, input, to))}` });
    metaAccepted = input.type === "Image"
      ? await sendWhatsAppImageMessage(message.workspaceId, to, input.data.mediaUrl, input.data.message)
      : input.type === "Document"
        ? await sendWhatsAppDocumentMessage(message.workspaceId, to, input.data.mediaUrl, input.data.message, input.data.fileName)
        : input.type === "Video"
          ? await sendWhatsAppVideoMessage(message.workspaceId, to, input.data.mediaUrl, input.data.message)
          : input.type === "Audio"
            ? await sendWhatsAppAudioMessage(message.workspaceId, to, input.data.mediaUrl)
            : input.type === "InteractiveButton"
              ? await sendWhatsAppInteractiveButtonMessage(message.workspaceId, to, input.data.message)
              : input.type === "Sticker"
                ? await sendWhatsAppStickerMessage(message.workspaceId, to, input.data.mediaUrl)
                : await sendWhatsAppTextMessage(message.workspaceId, to, input.data.message);
    const messageText = publicMessageText(input);
    const preview = messageText ? `You: ${messageText}` : `You: ${input.type}`;
    await prisma.$transaction(async (transaction) => {
      await transaction.message.update({ where: { id: message.id }, data: { metaMessageId: metaAccepted!.metaMessageId, status: "SENT", sentAt: metaAccepted!.sentAt, queueProcessingToken: null, queueProcessingAt: null, queueNextAttemptAt: null } });
      await transaction.conversation.update({ where: { id: message.conversationId }, data: { lastMessagePreview: preview, lastMessageAt: metaAccepted!.sentAt, phoneNumberId: metaAccepted!.phoneNumberId } });
    });
    return true;
  } catch (error) {
    if (metaAccepted) {
      await prisma.message.update({ where: { id: message.id }, data: { metaMessageId: metaAccepted.metaMessageId, status: "SENT", sentAt: metaAccepted.sentAt, queueProcessingToken: null, queueProcessingAt: null, queueNextAttemptAt: null, billingError: "Meta accepted the message but the response could not be persisted" } }).catch(() => undefined);
    }
    throw error;
  }
}

export async function sendPublicTextMessage(workspaceId: string, input: PublicTextMessageInput) {
  return sendPublicMessage(workspaceId, input);
}
