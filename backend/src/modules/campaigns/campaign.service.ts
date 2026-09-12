import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { contactWhereForSegment } from "../contacts/contact.service.js";
import type { SegmentCondition } from "../contacts/contact.schemas.js";
import type { CampaignListQuery, CreateCampaignInput } from "./campaign.schemas.js";

const campaignSelect = {
  id: true, workspaceId: true, name: true, channelKey: true, kind: true, category: true,
  templateKey: true, templateName: true, metaTemplateName: true, templateLanguageCode: true, templateBody: true, templateVariables: true, buttonTracking: true,
  audienceType: true, audienceLabel: true, audienceConfig: true, retryFailed: true,
  status: true, recipientCount: true, attempted: true, sent: true, delivered: true, read: true, replied: true,
  failed: true, scheduledAt: true, setLiveAt: true, completedAt: true, totalCost: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.CampaignSelect;

type CampaignRecord = Prisma.CampaignGetPayload<{ select: typeof campaignSelect }>;

function kindToDb(kind: CreateCampaignInput["kind"]): "ONE_TIME" | "ONGOING" | "API" {
  return kind === "ongoing" ? "ONGOING" : kind === "api" ? "API" : "ONE_TIME";
}

function serialize(campaign: CampaignRecord) {
  return {
    ...campaign,
    kind: campaign.kind === "ONGOING" ? "ongoing" : campaign.kind === "API" ? "api" : "one_time",
    createdById: campaign.createdBy?.id ?? null,
    createdBy: campaign.createdBy ? `${campaign.createdBy.firstName} ${campaign.createdBy.lastName}`.trim() || campaign.createdBy.email : "Interakt Admin",
    totalCost: campaign.totalCost === null ? null : Number(campaign.totalCost),
  };
}

function pagination(query: CampaignListQuery, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  return { page: query.page, pageSize: query.pageSize, total, totalPages, hasNext: query.page < totalPages, hasPrevious: query.page > 1 };
}

function whereFor(workspaceId: string, query: CampaignListQuery): Prisma.CampaignWhereInput {
  return {
    workspaceId,
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { templateName: { contains: query.search, mode: "insensitive" } }, { templateKey: { contains: query.search, mode: "insensitive" } }] } : {}),
    ...(query.status ? { status: { in: query.status } } : {}),
    ...(query.kind ? { kind: kindToDb(query.kind) } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.createdById ? { createdById: query.createdById } : {}),
    ...(query.hasSetLive === true ? { setLiveAt: { not: null } } : query.hasSetLive === false ? { setLiveAt: null } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
  };
}

async function requireCampaign(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: campaignSelect });
  if (!campaign) throw new AppError(404, "Campaign was not found", "CAMPAIGN_NOT_FOUND");
  return campaign;
}

async function ensureWhatsAppReady(transaction: Prisma.TransactionClient, workspaceId: string) {
  const connection = await transaction.whatsAppBusinessAccount.findFirst({
    where: { workspaceId, status: "CONNECTED", encryptedAccessToken: { not: null }, phoneNumbers: { some: { status: "ACTIVE" } } },
    select: { id: true },
  });
  if (!connection) throw new AppError(409, "Connect an active WhatsApp phone number before setting a campaign live", "WHATSAPP_NOT_CONNECTED");
}

type Recipient = { phoneE164: string; contactId: string };

async function eligiblePhoneRecipients(transaction: Prisma.TransactionClient, workspaceId: string, phoneNumbers: string[]): Promise<Recipient[]> {
  const contacts = await transaction.contact.findMany({
    where: { workspaceId, deletedAt: null, whatsappOpted: true, marketingBlocked: false, phoneE164: { in: phoneNumbers } },
    select: { id: true, phoneE164: true },
  });
  const byPhone = new Map(contacts.map((contact) => [contact.phoneE164, contact]));
  const missing = phoneNumbers.filter((phone) => !byPhone.has(phone));
  if (missing.length) throw new AppError(422, "Every campaign phone number must belong to an opted-in, marketing-eligible contact", "CAMPAIGN_PHONE_NOT_ELIGIBLE", { ineligiblePhoneNumbers: missing });
  return phoneNumbers.map((phoneE164) => ({ phoneE164, contactId: byPhone.get(phoneE164)!.id }));
}

async function resolveRecipients(transaction: Prisma.TransactionClient, workspaceId: string, input: CreateCampaignInput): Promise<Recipient[]> {
  if (input.audienceType === "manual" || input.audienceType === "csv") return eligiblePhoneRecipients(transaction, workspaceId, input.phoneNumbers);

  const baseWhere: Prisma.ContactWhereInput = { workspaceId, deletedAt: null, whatsappOpted: true, marketingBlocked: false };
  let where = baseWhere;
  if (input.audienceType === "contacts") {
    where = { ...baseWhere, id: { in: input.contactIds } };
  } else if (input.audienceType === "segment") {
    const segment = await transaction.contactSegment.findFirst({ where: { id: input.segmentId, workspaceId }, select: { definition: true } });
    if (!segment) throw new AppError(404, "The selected contact segment was not found", "CAMPAIGN_SEGMENT_NOT_FOUND");
    const segmentWhere = await contactWhereForSegment(workspaceId, segment.definition as SegmentCondition[]);
    where = { AND: [baseWhere, segmentWhere] };
  }
  const contacts = await transaction.contact.findMany({ where, select: { id: true, phoneE164: true } });
  if (input.audienceType === "contacts" && contacts.length !== input.contactIds.length) {
    throw new AppError(422, "One or more selected contacts cannot receive marketing messages", "CAMPAIGN_CONTACTS_INELIGIBLE", { eligibleContactIds: contacts.map(({ id }) => id) });
  }
  return contacts.map(({ id: contactId, phoneE164 }) => ({ contactId, phoneE164 }));
}

function languageCode(value: string) {
  const aliases: Record<string, string> = { English: "en_US", Hindi: "hi", "English (US)": "en_US", "English (UK)": "en_GB" };
  return aliases[value] ?? value.replace(/-/g, "_");
}

function metaTemplateName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 512) || "template";
}

function templateVariableCount(body: string) {
  return Math.max(0, ...[...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])));
}

export async function listCampaigns(workspaceId: string, query: CampaignListQuery) {
  const where = whereFor(workspaceId, query);
  const [total, items] = await prisma.$transaction([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({ where, select: campaignSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items: items.map(serialize), pagination: pagination(query, total) };
}

export async function getCampaign(workspaceId: string, campaignId: string) {
  const campaign = await requireCampaign(workspaceId, campaignId);
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId, workspaceId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, contactId: true, phoneE164: true, status: true, metaMessageId: true, attemptCount: true, attemptedAt: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, failedAt: true, failureReason: true, clickCount: true, contact: { select: { id: true, name: true } } } });
  return { ...serialize(campaign), recipients };
}

export async function createCampaign(workspaceId: string, actorUserId: string, input: CreateCampaignInput) {
  const campaign = await prisma.$transaction(async (transaction) => {
    let templateName: string | null = null;
    let remoteTemplateName: string | null = null;
    let templateLanguageCode: string | null = null;
    let templateBody: string | null = null;
    let buttonTracking: Prisma.InputJsonValue = [];
    if (input.templateKey) {
      const template = await transaction.template.findFirst({ where: { workspaceId, templateKey: input.templateKey, deletedAt: null }, select: { name: true, metaTemplateName: true, metaLanguageCode: true, language: true, body: true, content: true, status: true } });
      if (!template) throw new AppError(404, "The selected template was not found", "CAMPAIGN_TEMPLATE_NOT_FOUND");
      if (input.launchMode !== "draft" && template.status !== "APPROVED") throw new AppError(422, "Only approved templates can be sent", "CAMPAIGN_TEMPLATE_NOT_APPROVED");
      templateName = template.name;
      remoteTemplateName = template.metaTemplateName ?? metaTemplateName(template.name);
      templateLanguageCode = template.metaLanguageCode ?? languageCode(template.language);
      templateBody = template.body;
      const variableCount = templateVariableCount(template.body);
      if (input.launchMode !== "draft" && input.templateVariables.length !== variableCount) throw new AppError(422, "Map every WhatsApp template variable before sending", "CAMPAIGN_TEMPLATE_VARIABLES_REQUIRED", { variableCount, mappedCount: input.templateVariables.length });
      if (template.content && typeof template.content === "object" && !Array.isArray(template.content) && "buttons" in template.content) {
        const buttons = (template.content as { buttons?: unknown }).buttons;
        if (Array.isArray(buttons)) buttonTracking = buttons as Prisma.InputJsonValue;
      }
    } else if (input.launchMode !== "draft") {
      throw new AppError(422, "Choose an approved WhatsApp template before sending", "CAMPAIGN_TEMPLATE_REQUIRED");
    }

    if (input.launchMode !== "draft") await ensureWhatsAppReady(transaction, workspaceId);
    const recipients = await resolveRecipients(transaction, workspaceId, input);
    if (input.launchMode !== "draft" && recipients.length === 0) throw new AppError(422, "The campaign audience has no eligible contacts", "CAMPAIGN_AUDIENCE_EMPTY");
    const now = new Date();
    const status = input.launchMode === "schedule" ? "SCHEDULED" : input.launchMode === "send" ? "RUNNING" : "DRAFT";
    const audienceConfig = { ...input.audienceConfig, ...(input.segmentId ? { segmentId: input.segmentId } : {}) } as Prisma.InputJsonValue;
    return transaction.campaign.create({
      data: {
        workspaceId, name: input.name, kind: kindToDb(input.kind), category: input.category, templateKey: input.templateKey || null, templateName, metaTemplateName: remoteTemplateName, templateLanguageCode, templateBody, templateVariables: input.templateVariables as Prisma.InputJsonValue, buttonTracking,
        audienceType: input.audienceType, audienceLabel: input.audienceLabel, audienceConfig, retryFailed: input.retryFailed,
        status, recipientCount: recipients.length, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        setLiveAt: input.launchMode === "send" ? now : null, createdById: actorUserId,
        recipients: recipients.length ? { create: recipients.map(({ contactId, phoneE164 }) => ({ workspaceId, contactId, phoneE164 })) } : undefined,
      },
      select: campaignSelect,
    });
  });
  return serialize(campaign);
}

export async function duplicateCampaign(workspaceId: string, campaignId: string, actorUserId: string) {
  const source = await requireCampaign(workspaceId, campaignId);
  const recipients = await prisma.campaignRecipient.findMany({ where: { workspaceId, campaignId }, select: { contactId: true, phoneE164: true } });
  const duplicate = await prisma.campaign.create({ data: {
    workspaceId, name: `${source.name} (Copy)`, kind: source.kind, category: source.category, templateKey: source.templateKey, templateName: source.templateName, metaTemplateName: source.metaTemplateName, templateLanguageCode: source.templateLanguageCode, templateBody: source.templateBody, templateVariables: source.templateVariables as Prisma.InputJsonValue, buttonTracking: source.buttonTracking as Prisma.InputJsonValue,
    audienceType: source.audienceType, audienceLabel: source.audienceLabel, audienceConfig: source.audienceConfig as Prisma.InputJsonValue, retryFailed: source.retryFailed, createdById: actorUserId,
    recipientCount: recipients.length, recipients: recipients.length ? { create: recipients.map((recipient) => ({ workspaceId, ...recipient })) } : undefined,
  }, select: campaignSelect });
  return serialize(duplicate);
}

export async function deleteCampaign(workspaceId: string, campaignId: string) {
  const campaign = await requireCampaign(workspaceId, campaignId);
  if (["RUNNING", "SCHEDULED"].includes(campaign.status)) throw new AppError(409, "Pause or finish a live campaign before deleting it", "CAMPAIGN_ACTIVE");
  await prisma.campaign.delete({ where: { id: campaignId, workspaceId } });
}

export { templateVariableCount };
