import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { CampaignListQuery, CreateCampaignInput } from "./campaign.schemas.js";

const campaignSelect = {
  id: true, workspaceId: true, name: true, channelKey: true, kind: true, category: true,
  templateKey: true, templateName: true, templateBody: true, buttonTracking: true, audienceType: true, audienceLabel: true, audienceConfig: true,
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

async function resolveRecipients(transaction: Prisma.TransactionClient, workspaceId: string, input: CreateCampaignInput) {
  if (input.audienceType === "manual") return input.phoneNumbers.map((phoneE164) => ({ phoneE164, contactId: null }));
  if (input.audienceType === "segment") return [];

  const where: Prisma.ContactWhereInput = {
    workspaceId,
    deletedAt: null,
    whatsappOpted: true,
    marketingBlocked: false,
    ...(input.audienceType === "contacts" ? { id: { in: input.contactIds } } : {}),
  };
  const contacts = await transaction.contact.findMany({ where, select: { id: true, phoneE164: true } });
  if (input.audienceType === "contacts" && contacts.length !== input.contactIds.length) {
    throw new AppError(422, "One or more selected contacts cannot receive marketing messages", "CAMPAIGN_CONTACTS_INELIGIBLE", { eligibleContactIds: contacts.map(({ id }) => id) });
  }
  return contacts.map(({ id: contactId, phoneE164 }) => ({ contactId, phoneE164 }));
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
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId, workspaceId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, contactId: true, phoneE164: true, status: true, metaMessageId: true, attemptedAt: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, failedAt: true, failureReason: true, clickCount: true, contact: { select: { id: true, name: true } } } });
  return { ...serialize(campaign), recipients };
}

export async function createCampaign(workspaceId: string, actorUserId: string, input: CreateCampaignInput) {
  return prisma.$transaction(async (transaction) => {
    let templateName: string | null = null;
    let templateBody: string | null = null;
    let buttonTracking: Prisma.InputJsonValue = [];
    if (input.templateKey) {
      const template = await transaction.template.findFirst({ where: { workspaceId, templateKey: input.templateKey, deletedAt: null }, select: { name: true, body: true, content: true, status: true } });
      if (!template) throw new AppError(404, "The selected template was not found", "CAMPAIGN_TEMPLATE_NOT_FOUND");
      if (input.launchMode !== "draft" && template.status !== "APPROVED") throw new AppError(422, "Only approved templates can be sent", "CAMPAIGN_TEMPLATE_NOT_APPROVED");
      templateName = template.name;
      templateBody = template.body;
      if (template.content && typeof template.content === "object" && !Array.isArray(template.content) && "buttons" in template.content) {
        const buttons = (template.content as { buttons?: unknown }).buttons;
        if (Array.isArray(buttons)) buttonTracking = buttons as Prisma.InputJsonValue;
      }
    } else if (input.launchMode !== "draft") {
      throw new AppError(422, "Choose an approved WhatsApp template before sending", "CAMPAIGN_TEMPLATE_REQUIRED");
    }

    const recipients = await resolveRecipients(transaction, workspaceId, input);
    const now = new Date();
    const status = input.launchMode === "schedule" ? "SCHEDULED" : input.launchMode === "send" ? "RUNNING" : "DRAFT";
    const campaign = await transaction.campaign.create({
      data: {
        workspaceId, name: input.name, kind: kindToDb(input.kind), category: input.category, templateKey: input.templateKey || null, templateName, templateBody, buttonTracking,
        audienceType: input.audienceType, audienceLabel: input.audienceLabel, audienceConfig: input.audienceConfig as Prisma.InputJsonValue,
        status, recipientCount: recipients.length, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        setLiveAt: input.launchMode === "draft" ? null : input.scheduledAt ? new Date(input.scheduledAt) : now, createdById: actorUserId,
        recipients: recipients.length ? { create: recipients.map(({ contactId, phoneE164 }) => ({ workspaceId, contactId, phoneE164 })) } : undefined,
      },
      select: campaignSelect,
    });
    return serialize(campaign);
  });
}

export async function duplicateCampaign(workspaceId: string, campaignId: string, actorUserId: string) {
  const source = await requireCampaign(workspaceId, campaignId);
  const recipients = await prisma.campaignRecipient.findMany({ where: { workspaceId, campaignId }, select: { contactId: true, phoneE164: true } });
  const duplicate = await prisma.campaign.create({ data: {
    workspaceId, name: `${source.name} (Copy)`, kind: source.kind, category: source.category, templateKey: source.templateKey, templateName: source.templateName, templateBody: source.templateBody, buttonTracking: source.buttonTracking as Prisma.InputJsonValue,
    audienceType: source.audienceType, audienceLabel: source.audienceLabel, audienceConfig: source.audienceConfig as Prisma.InputJsonValue, createdById: actorUserId,
    recipientCount: recipients.length, recipients: recipients.length ? { create: recipients.map((recipient) => ({ workspaceId, ...recipient })) } : undefined,
  }, select: campaignSelect });
  return serialize(duplicate);
}

export async function deleteCampaign(workspaceId: string, campaignId: string) {
  await requireCampaign(workspaceId, campaignId);
  await prisma.campaign.delete({ where: { id: campaignId, workspaceId } });
}
