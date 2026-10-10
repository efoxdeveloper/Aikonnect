import { randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { resolveWorkspaceEntitlements } from "../billing/entitlements.service.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendWhatsAppTemplateMessage, type WhatsAppTemplateMedia, type WhatsAppTemplateParameter } from "../whatsapp/whatsapp.service.js";
import { refreshCampaignMetrics } from "./campaign.metrics.js";
import { campaignWalletCanCover, templateVariableCount } from "./campaign.service.js";
import { messagePricingSnapshot, resolveMessagePricing } from "../whatsapp-pricing/pricing.service.js";
import { reserveMessageBilling, releaseMessageBilling } from "../billing/billing.service.js";
import { publishCampaignUpdated } from "../../realtime/campaign.js";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 25;
const POLL_INTERVAL_MS = 10_000;
// A Meta request is bounded to 60 seconds. Keep the lease much longer so a slow
// request cannot be picked up by another worker while the first one is active.
const RECIPIENT_LEASE_MS = 5 * 60_000;

type CampaignVariable = { source: "contact" | "custom" | "constant"; field: string; fallback: string };

function variables(value: unknown): CampaignVariable[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CampaignVariable => Boolean(item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).source && typeof (item as Record<string, unknown>).field === "string" && typeof (item as Record<string, unknown>).fallback === "string"));
}

function parameterValue(variable: CampaignVariable, contact: { name: string; phoneE164: string; email: string | null; source: string; status: string; customAttributes: unknown }) {
  if (variable.source === "constant") return variable.field || variable.fallback;
  if (variable.source === "custom") {
    const attributes = contact.customAttributes && typeof contact.customAttributes === "object" && !Array.isArray(contact.customAttributes) ? contact.customAttributes as Record<string, unknown> : {};
    const value = attributes[variable.field];
    return value === null || value === undefined ? variable.fallback : String(value);
  }
  const standard: Record<string, string | null> = { name: contact.name, phone: contact.phoneE164, email: contact.email, source: contact.source, status: contact.status };
  const value = standard[variable.field];
  return value === null || value === undefined || value === "" ? variable.fallback : value;
}

function templateParameters(body: string, mappings: CampaignVariable[], contact: { name: string; phoneE164: string; email: string | null; source: string; status: string; customAttributes: unknown }): WhatsAppTemplateParameter[] {
  const count = templateVariableCount(body);
  if (!count) return [];
  return Array.from({ length: count }, (_, index) => ({ type: "text", text: parameterValue(mappings[index] ?? { source: "constant", field: "", fallback: "" }, contact) }));
}

function templateMedia(value: unknown): WhatsAppTemplateMedia | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const media = (value as Record<string, unknown>).templateMedia;
  if (!media || typeof media !== "object" || Array.isArray(media)) return undefined;
  const record = media as Record<string, unknown>;
  if (record.kind !== "single" && record.kind !== "carousel") return undefined;
  if (!Array.isArray(record.items)) return undefined;
  const items = record.items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const recordItem = item as Record<string, unknown>;
    if (typeof recordItem.mediaId !== "string" || !recordItem.mediaId.trim()) return [];
    const type: "image" | "video" | "document" = recordItem.type === "video" || recordItem.type === "document" ? recordItem.type : "image";
    return [{ mediaId: recordItem.mediaId, type, ...(typeof recordItem.fileName === "string" ? { fileName: recordItem.fileName } : {}) }];
  });
  return items.length ? { kind: record.kind, items } : undefined;
}

function failureMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  return error instanceof Error ? error.message : "The campaign message could not be sent";
}

export async function claimRecipient(campaignId: string) {
  const now = new Date();
  const retryCutoff = new Date(now.getTime() - 1_000);
  const legacyCutoff = new Date(now.getTime() - RECIPIENT_LEASE_MS);
  const candidate = await prisma.campaignRecipient.findFirst({
    where: {
      campaignId,
      campaign: { is: { status: "RUNNING" } },
      OR: [
        { status: "PENDING", processingToken: null },
        { status: "FAILED", attemptCount: { lt: MAX_ATTEMPTS }, updatedAt: { lte: retryCutoff }, processingToken: null },
        {
          status: "ATTEMPTED",
          attemptCount: { lt: MAX_ATTEMPTS },
          OR: [
            { processingExpiresAt: { lte: now } },
            // Recover rows created before recipient leases were deployed, but
            // never reclaim a current in-flight attempt after one second.
            { processingToken: null, attemptedAt: { lte: legacyCutoff } },
          ],
        },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, contactId: true, phoneE164: true, status: true, attemptCount: true },
  });
  if (!candidate) return null;
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + RECIPIENT_LEASE_MS);
  const claimed = await prisma.campaignRecipient.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      campaign: { is: { status: "RUNNING" } },
      ...(candidate.attemptCount > 0 ? { attemptCount: { lt: MAX_ATTEMPTS } } : {}),
      ...(candidate.status === "ATTEMPTED"
        ? { OR: [{ processingExpiresAt: { lte: now } }, { processingToken: null, attemptedAt: { lte: legacyCutoff } }] }
        : { processingToken: null }),
    },
    data: { status: "ATTEMPTED", attemptedAt: now, processingToken: leaseToken, processingExpiresAt: leaseExpiresAt, attemptCount: { increment: 1 } },
  });
  return claimed.count === 1 ? { ...candidate, leaseToken } : null;
}

async function markFailed(campaignId: string, recipientId: string, leaseToken: string, reason: string) {
  await prisma.campaignRecipient.updateMany({ where: { id: recipientId, campaignId, status: "ATTEMPTED", processingToken: leaseToken }, data: { status: "FAILED", failedAt: new Date(), failureReason: reason, processingToken: null, processingExpiresAt: null } });
  const recipient = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { workspaceId: true } });
  if (recipient) await refreshCampaignMetrics(recipient.workspaceId, campaignId);
}

async function sendRecipient(campaignId: string, recipientId: string, leaseToken: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, workspaceId: true, category: true, templateBody: true, metaTemplateName: true, templateLanguageCode: true, templateVariables: true, audienceConfig: true },
  });
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true, contactId: true, phoneE164: true, status: true, processingToken: true, contact: { select: { id: true, name: true, phoneE164: true, email: true, source: true, status: true, customAttributes: true, whatsappOpted: true, marketingBlocked: true, deletedAt: true } } },
  });
  if (!campaign || !recipient || recipient.status !== "ATTEMPTED" || recipient.processingToken !== leaseToken) return;
  if (!recipient.contactId || !recipient.contact) throw new AppError(422, "The campaign recipient no longer has an eligible contact", "CAMPAIGN_CONTACT_NOT_ELIGIBLE");
  if (recipient.contact.deletedAt || !recipient.contact.whatsappOpted || recipient.contact.marketingBlocked) throw new AppError(422, "The recipient is no longer eligible for WhatsApp marketing", "CAMPAIGN_CONSENT_REVOKED");
  if (!campaign.metaTemplateName || !campaign.templateLanguageCode || !campaign.templateBody) throw new AppError(422, "The campaign template snapshot is incomplete", "CAMPAIGN_TEMPLATE_IDENTITY_INVALID");

  const pricing = await resolveMessagePricing({ phoneNumber: recipient.phoneE164, category: campaign.category, pricingType: "REGULAR" });

  const idempotencyKey = `campaign:${campaign.id}:recipient:${recipient.id}`;
  const existingMessage = await prisma.message.findUnique({
    where: { workspaceId_apiIdempotencyKey: { workspaceId: campaign.workspaceId, apiIdempotencyKey: idempotencyKey } },
    select: { id: true, conversationId: true, metaMessageId: true, sentAt: true },
  });
  if (existingMessage?.metaMessageId) {
    await prisma.$transaction(async (transaction) => {
      await transaction.campaignRecipient.updateMany({ where: { id: recipient.id, campaignId, status: "ATTEMPTED", processingToken: leaseToken }, data: { status: "SENT", metaMessageId: existingMessage.metaMessageId, sentAt: existingMessage.sentAt, processingToken: null, processingExpiresAt: null, failedAt: null, failureReason: null } });
      await transaction.conversation.update({ where: { id: existingMessage.conversationId }, data: { lastMessagePreview: `You: ${campaign.templateBody}`, lastMessageAt: existingMessage.sentAt } });
    });
    await refreshCampaignMetrics(campaign.workspaceId, campaignId);
    return;
  }

  const sentAt = new Date();
  const conversation = await prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.upsert({
      where: { workspaceId_contactId_channelKey: { workspaceId: campaign.workspaceId, contactId: recipient.contact!.id, channelKey: "whatsapp" } },
      create: { workspaceId: campaign.workspaceId, contactId: recipient.contact!.id, channelKey: "whatsapp", status: "OPEN" },
      update: { deletedAt: null },
      select: { id: true },
    });
    const message = await transaction.message.upsert({
      where: { workspaceId_apiIdempotencyKey: { workspaceId: campaign.workspaceId, apiIdempotencyKey: idempotencyKey } },
      create: { workspaceId: campaign.workspaceId, conversationId: conversation.id, contactId: recipient.contact!.id, apiIdempotencyKey: idempotencyKey, direction: "OUTGOING", type: "TEXT", status: "QUEUED", text: campaign.templateBody, ...messagePricingSnapshot(pricing), payload: { source: "campaign", campaignId: campaign.id }, sentAt },
      update: { status: "QUEUED", failedAt: null, failureReason: null },
      select: { id: true },
    });
    return { id: conversation.id, messageId: message.id };
  });
  let reservation: { id: string } | null = null;
  try {
    const billing = await reserveMessageBilling({ workspaceId: campaign.workspaceId, messageId: conversation.messageId, pricing, clientReference: idempotencyKey, idempotencyKey });
    reservation = billing.reservation;
    const sent = await sendWhatsAppTemplateMessage(campaign.workspaceId, recipient.phoneE164, campaign.metaTemplateName, campaign.templateLanguageCode, templateParameters(campaign.templateBody, variables(campaign.templateVariables), recipient.contact), idempotencyKey, templateMedia(campaign.audienceConfig));
    await prisma.$transaction(async (transaction) => {
      await transaction.message.update({ where: { id: conversation.messageId }, data: { metaMessageId: sent.metaMessageId, status: "SENT" } });
      await transaction.campaignRecipient.updateMany({ where: { id: recipient.id, status: "ATTEMPTED", processingToken: leaseToken }, data: { status: "SENT", metaMessageId: sent.metaMessageId, sentAt: sent.sentAt, processingToken: null, processingExpiresAt: null, failedAt: null, failureReason: null } });
      await transaction.conversation.update({ where: { id: conversation.id }, data: { lastMessagePreview: `You: ${campaign.templateBody}`, lastMessageAt: sent.sentAt } });
    });
  } catch (error) {
    if (reservation) await releaseMessageBilling(conversation.messageId, error instanceof Error ? error.message : "Meta rejected the message");
    await prisma.message.update({ where: { id: conversation.messageId }, data: { status: "FAILED", failedAt: new Date(), failureReason: failureMessage(error) } }).catch(() => undefined);
    throw error;
  }
  await refreshCampaignMetrics(campaign.workspaceId, campaignId);
}

export async function processCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, workspaceId: true, status: true, scheduledAt: true, category: true } });
  if (!campaign || !["RUNNING", "SCHEDULED"].includes(campaign.status)) return;
  const now = new Date();
  if (campaign.scheduledAt && campaign.scheduledAt > now) return;

  const pauseForExpiredTrial = async () => {
    const entitlements = await resolveWorkspaceEntitlements(campaign.workspaceId);
    if (entitlements.status !== "EXPIRED") return false;
    await prisma.campaign.updateMany({ where: { id: campaign.id, status: { in: ["RUNNING", "SCHEDULED"] } }, data: { status: "PAUSED" } });
    return true;
  };

  if (await pauseForExpiredTrial()) return;
  if (campaign.status === "SCHEDULED") {
    const pendingRecipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, workspaceId: campaign.workspaceId, status: "PENDING" },
      select: { phoneE164: true },
    });
    if (!await campaignWalletCanCover(campaign.workspaceId, campaign.category, pendingRecipients)) return;
    const started = await prisma.campaign.updateMany({
      where: { id: campaign.id, status: "SCHEDULED", OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
      data: { status: "RUNNING", setLiveAt: now },
    });
    if (!started.count) return;
  }
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (!current || current.status !== "RUNNING") break;
    if (await pauseForExpiredTrial()) break;
    const candidate = await claimRecipient(campaignId);
    if (!candidate) break;
    publishCampaignUpdated(campaign.workspaceId, campaignId);
    try {
      await sendRecipient(campaignId, candidate.id, candidate.leaseToken);
    } catch (error) {
      const reason = failureMessage(error);
      logger.error({ campaignId, recipientId: candidate.id, error }, "WhatsApp campaign recipient failed");
      await markFailed(campaignId, candidate.id, candidate.leaseToken, reason);
    }
  }
  await refreshCampaignMetrics(campaign.workspaceId, campaignId);
}

export async function processDueCampaigns() {
  const now = new Date();
  await prisma.campaignRecipient.updateMany({ where: { status: "ATTEMPTED", attemptCount: { gte: MAX_ATTEMPTS }, OR: [{ processingExpiresAt: { lte: now } }, { processingToken: null, attemptedAt: { lt: new Date(now.getTime() - RECIPIENT_LEASE_MS) } }] }, data: { status: "FAILED", failedAt: now, failureReason: "The delivery worker stopped before completing this attempt", processingToken: null, processingExpiresAt: null } });
  const [running, scheduled] = await Promise.all([
    prisma.campaign.findMany({ where: { status: "RUNNING" }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 20, select: { id: true } }),
    prisma.campaign.findMany({ where: { status: "SCHEDULED", OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 20, select: { id: true } }),
  ]);
  const campaigns = [...running, ...scheduled];
  for (const campaign of campaigns) await processCampaign(campaign.id);
}

export function dispatchCampaign(campaignId: string) {
  return processCampaign(campaignId).catch((error) => logger.error({ campaignId, error }, "WhatsApp campaign processing failed"));
}

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export function startCampaignWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning) return;
    workerRunning = true;
    void processDueCampaigns().catch((error) => logger.error({ error }, "WhatsApp campaign scheduler tick failed")).finally(() => { workerRunning = false; });
  }, POLL_INTERVAL_MS);
  workerTimer.unref();
  void processDueCampaigns().catch((error) => logger.error({ error }, "WhatsApp campaign scheduler startup failed"));
}
