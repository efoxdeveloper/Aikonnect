import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { hashToken } from "../../utils/crypto.js";
import { reserveMessageBilling, releaseMessageBilling } from "../billing/billing.service.js";
import { resolveMessagePricing, type PricingSnapshot, messagePricingSnapshot } from "../whatsapp-pricing/pricing.service.js";
import { sendWhatsAppTemplateMessage, type WhatsAppTemplateParameter } from "../whatsapp/whatsapp.service.js";
import type { SendMessageInput } from "./developer-api.schemas.js";

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return `+${digits}`;
}

function fixed(value: Prisma.Decimal | null | undefined) {
  return value?.toFixed(6) ?? null;
}

async function serializeMessage(messageId: string) {
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
