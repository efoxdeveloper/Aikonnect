import { prisma } from "../../database/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error-handler.js";
import { sendWhatsAppTemplateMessage, type WhatsAppTemplateParameter } from "../whatsapp/whatsapp.service.js";
import { refreshCampaignMetrics } from "./campaign.metrics.js";
import { templateVariableCount } from "./campaign.service.js";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 25;
const POLL_INTERVAL_MS = 10_000;

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

function failureMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  return error instanceof Error ? error.message : "The campaign message could not be sent";
}

async function claimRecipient(campaignId: string) {
  const cutoff = new Date(Date.now() - 1_000);
  const candidate = await prisma.campaignRecipient.findFirst({
    where: {
      campaignId,
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attemptCount: { lt: MAX_ATTEMPTS }, updatedAt: { lte: cutoff } },
        { status: "ATTEMPTED", attemptCount: { lt: MAX_ATTEMPTS }, attemptedAt: { lt: cutoff } },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, contactId: true, phoneE164: true, status: true, attemptCount: true },
  });
  if (!candidate) return null;
  const claimed = await prisma.campaignRecipient.updateMany({
    where: { id: candidate.id, status: candidate.status, ...(candidate.attemptCount > 0 ? { attemptCount: { lt: MAX_ATTEMPTS } } : {}) },
    data: { status: "ATTEMPTED", attemptedAt: new Date(), attemptCount: { increment: 1 } },
  });
  return claimed.count === 1 ? candidate : null;
}

async function markFailed(campaignId: string, recipientId: string, reason: string) {
  await prisma.campaignRecipient.updateMany({ where: { id: recipientId, campaignId, status: "ATTEMPTED" }, data: { status: "FAILED", failedAt: new Date(), failureReason: reason } });
  const recipient = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { workspaceId: true } });
  if (recipient) await refreshCampaignMetrics(recipient.workspaceId, campaignId);
}

async function sendRecipient(campaignId: string, recipientId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, workspaceId: true, templateBody: true, metaTemplateName: true, templateLanguageCode: true, templateVariables: true },
  });
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true, contactId: true, phoneE164: true, status: true, contact: { select: { id: true, name: true, phoneE164: true, email: true, source: true, status: true, customAttributes: true, whatsappOpted: true, marketingBlocked: true, deletedAt: true } } },
  });
  if (!campaign || !recipient || recipient.status !== "ATTEMPTED") return;
  if (!recipient.contactId || !recipient.contact) throw new AppError(422, "The campaign recipient no longer has an eligible contact", "CAMPAIGN_CONTACT_NOT_ELIGIBLE");
  if (recipient.contact.deletedAt || !recipient.contact.whatsappOpted || recipient.contact.marketingBlocked) throw new AppError(422, "The recipient is no longer eligible for WhatsApp marketing", "CAMPAIGN_CONSENT_REVOKED");
  if (!campaign.metaTemplateName || !campaign.templateLanguageCode || !campaign.templateBody) throw new AppError(422, "The campaign template snapshot is incomplete", "CAMPAIGN_TEMPLATE_IDENTITY_INVALID");

  const sent = await sendWhatsAppTemplateMessage(
    campaign.workspaceId,
    recipient.phoneE164,
    campaign.metaTemplateName,
    campaign.templateLanguageCode,
    templateParameters(campaign.templateBody, variables(campaign.templateVariables), recipient.contact),
  );
  const sentAt = sent.sentAt;
  await prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.upsert({
      where: { workspaceId_contactId_channelKey: { workspaceId: campaign.workspaceId, contactId: recipient.contact!.id, channelKey: "whatsapp" } },
      create: { workspaceId: campaign.workspaceId, contactId: recipient.contact!.id, phoneNumberId: sent.phoneNumberId, channelKey: "whatsapp", status: "OPEN" },
      update: { phoneNumberId: sent.phoneNumberId },
      select: { id: true },
    });
    await transaction.message.create({
      data: { workspaceId: campaign.workspaceId, conversationId: conversation.id, contactId: recipient.contact!.id, metaMessageId: sent.metaMessageId, direction: "OUTGOING", type: "TEXT", status: "SENT", text: campaign.templateBody, payload: { source: "campaign", campaignId: campaign.id }, sentAt },
    });
    await transaction.campaignRecipient.updateMany({ where: { id: recipient.id, status: "ATTEMPTED" }, data: { status: "SENT", metaMessageId: sent.metaMessageId, sentAt, failedAt: null, failureReason: null } });
    await transaction.conversation.update({ where: { id: conversation.id }, data: { lastMessagePreview: campaign.templateBody, lastMessageAt: sentAt } });
  });
  await refreshCampaignMetrics(campaign.workspaceId, campaignId);
}

export async function processCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, workspaceId: true, status: true, scheduledAt: true } });
  if (!campaign || campaign.status !== "RUNNING") return;
  if (campaign.scheduledAt && campaign.scheduledAt > new Date()) return;
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const candidate = await claimRecipient(campaignId);
    if (!candidate) break;
    try {
      await sendRecipient(campaignId, candidate.id);
    } catch (error) {
      const reason = failureMessage(error);
      logger.error({ campaignId, recipientId: candidate.id, error }, "WhatsApp campaign recipient failed");
      await markFailed(campaignId, candidate.id, reason);
    }
  }
  await refreshCampaignMetrics(campaign.workspaceId, campaignId);
}

export async function processDueCampaigns() {
  const now = new Date();
  await prisma.campaignRecipient.updateMany({ where: { status: "ATTEMPTED", attemptCount: { gte: MAX_ATTEMPTS }, attemptedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }, data: { status: "FAILED", failedAt: now, failureReason: "The delivery worker stopped before completing this attempt" } });
  await prisma.campaign.updateMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, data: { status: "RUNNING", setLiveAt: now } });
  const campaigns = await prisma.campaign.findMany({ where: { status: "RUNNING" }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 20, select: { id: true } });
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
