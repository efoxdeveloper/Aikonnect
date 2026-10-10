import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { contactWhereForSegment } from "../contacts/contact.service.js";
import type { SegmentCondition } from "../contacts/contact.schemas.js";
import { campaignTemplateMediaSchema, type CampaignControlAction, type CampaignListQuery, type CreateCampaignInput } from "./campaign.schemas.js";
import { enforceCampaignPlanLimit } from "./campaign-plan-limits.js";
import { refreshCampaignCost } from "./campaign.metrics.js";
import { getWallet } from "../wallet/wallet.service.js";
import { resolveBilling } from "../billing/billing.service.js";
import { getRate } from "../whatsapp-pricing/pricing.service.js";
import { resolvePricingCountry } from "../whatsapp-pricing/country.service.js";
import type { EstimateCampaignInput } from "./campaign.schemas.js";
import { missingCampaignTemplateParameters, requiredCampaignCarouselMediaCount, unsupportedCampaignTemplateRequirement } from "./campaign-template-validation.js";
import { canCoverCampaignEstimate } from "./campaign-wallet-validation.js";
import { publishCampaignUpdated } from "../../realtime/campaign.js";

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
    createdBy: campaign.createdBy ? `${campaign.createdBy.firstName} ${campaign.createdBy.lastName}`.trim() || campaign.createdBy.email : "Marento Admin",
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

async function estimateWalletForRecipients(workspaceId: string, category: string, recipients: Array<{ phoneE164: string }>) {
  const wallet = await getWallet(workspaceId);
  const groups = new Map<string, { countryCode: string; countryName: string; count: number; estimatedCost: Prisma.Decimal; metaCost: Prisma.Decimal }>();
  let allowNegativeBalance = false;
  let creditLimit = new Prisma.Decimal(0);
  for (const recipient of recipients) {
    const country = resolvePricingCountry(recipient.phoneE164);
    let group = groups.get(country.countryCode);
    if (!group) {
      const rate = await getRate({ countryCode: country.countryCode, category, pricingType: "REGULAR" });
      const billing = await resolveBilling(workspaceId, { ...rate, countryName: country.countryName } as Parameters<typeof resolveBilling>[1]);
      allowNegativeBalance = billing.settings.allowNegativeBalance;
      creditLimit = new Prisma.Decimal(billing.settings.creditLimit.toString());
      group = { countryCode: country.countryCode, countryName: country.countryName, count: 0, estimatedCost: billing.walletChargeAmount, metaCost: billing.metaAmount };
      groups.set(country.countryCode, group);
    }
    group.count += 1;
  }
  const countryGroups = [...groups.values()];
  const countries = countryGroups.map((group) => ({
    countryCode: group.countryCode,
    countryName: group.countryName,
    recipients: group.count,
    estimatedWalletCost: group.estimatedCost.mul(group.count).toFixed(2),
    estimatedMetaCost: group.metaCost.mul(group.count).toFixed(2),
  }));
  const estimatedWalletCost = countryGroups.reduce((sum, group) => sum.add(group.estimatedCost.mul(group.count)), new Prisma.Decimal(0));
  const estimatedMetaCost = countryGroups.reduce((sum, group) => sum.add(group.metaCost.mul(group.count)), new Prisma.Decimal(0));
  const availableBalance = new Prisma.Decimal(wallet.availableBalance);
  return {
    wallet,
    countries,
    estimatedWalletCost,
    estimatedMetaCost,
    availableBalance,
    canCoverEstimate: canCoverCampaignEstimate({ availableBalance: availableBalance.toString(), estimatedCost: estimatedWalletCost.toString(), allowNegativeBalance, creditLimit: creditLimit.toString() }),
  };
}

export async function campaignWalletCanCover(workspaceId: string, category: string, recipients: Array<{ phoneE164: string }>) {
  return (await estimateWalletForRecipients(workspaceId, category, recipients)).canCoverEstimate;
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

function campaignTemplateMedia(value: unknown) {
  return campaignTemplateMediaSchema.safeParse(value).success ? campaignTemplateMediaSchema.parse(value) : null;
}

async function assertCampaignTemplateValues(transaction: Prisma.TransactionClient, workspaceId: string, recipients: Recipient[], variables: CreateCampaignInput["templateVariables"]) {
  if (!variables.length || !recipients.length) return;
  const contacts = await transaction.contact.findMany({
    where: { workspaceId, id: { in: recipients.map((recipient) => recipient.contactId) } },
    select: { id: true, name: true, phoneE164: true, email: true, source: true, status: true, customAttributes: true },
  });
  const missing = missingCampaignTemplateParameters(variables, contacts);
  if (missing.length) {
    const description = missing.map(({ index, recipientCount }) => `{{${index}}} is empty for ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`).join("; ");
    throw new AppError(422, `Campaign cannot launch because required template values are missing: ${description}. Add a fallback value or choose a populated contact field.`, "CAMPAIGN_TEMPLATE_PARAMETER_VALUE_MISSING", { missingParameters: missing });
  }
}

function assertCampaignTemplateSupported(template: { category: string; templateType?: string; headerText?: string | null; content: unknown }) {
  const issue = unsupportedCampaignTemplateRequirement(template);
  if (issue) throw new AppError(422, issue, "CAMPAIGN_TEMPLATE_COMPONENT_UNSUPPORTED");
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
  await refreshCampaignCost(workspaceId, campaignId);
  const campaign = await requireCampaign(workspaceId, campaignId);
  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId, workspaceId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, contactId: true, phoneE164: true, status: true, metaMessageId: true, attemptCount: true, attemptedAt: true, sentAt: true, deliveredAt: true, readAt: true, repliedAt: true, failedAt: true, failureReason: true, clickCount: true, contact: { select: { id: true, name: true } } } });
  return { ...serialize(campaign), recipients };
}

export async function createCampaign(workspaceId: string, actorUserId: string, input: CreateCampaignInput) {
  const campaign = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    if (input.launchMode !== "draft") {
      const launchAt = input.launchMode === "schedule" && input.scheduledAt ? new Date(input.scheduledAt) : now;
      await enforceCampaignPlanLimit(transaction, workspaceId, launchAt, now);
    }
    let templateName: string | null = null;
    let remoteTemplateName: string | null = null;
    let templateLanguageCode: string | null = null;
    let templateBody: string | null = null;
    let buttonTracking: Prisma.InputJsonValue = [];
    if (input.templateKey) {
      const template = await transaction.template.findFirst({ where: { workspaceId, templateKey: input.templateKey, deletedAt: null }, select: { name: true, category: true, metaTemplateName: true, metaLanguageCode: true, language: true, templateType: true, headerType: true, headerText: true, body: true, content: true, status: true } });
      if (!template) throw new AppError(404, "The selected template was not found", "CAMPAIGN_TEMPLATE_NOT_FOUND");
      if (input.launchMode !== "draft" && template.status !== "APPROVED") throw new AppError(422, "Only approved templates can be sent", "CAMPAIGN_TEMPLATE_NOT_APPROVED");
      if (input.launchMode !== "draft") assertCampaignTemplateSupported(template);
      templateName = template.name;
      remoteTemplateName = template.metaTemplateName ?? metaTemplateName(template.name);
      templateLanguageCode = template.metaLanguageCode ?? languageCode(template.language);
      templateBody = template.body;
      const media = campaignTemplateMedia(input.audienceConfig.templateMedia);
      if (input.launchMode !== "draft" && template.headerType && ["image", "video", "doc"].includes(template.headerType) && (!media || media.kind !== "single" || !media.items.length)) {
        throw new AppError(422, "Upload the campaign media required by this template before sending", "CAMPAIGN_TEMPLATE_MEDIA_REQUIRED", { headerType: template.headerType });
      }
      if (input.launchMode !== "draft" && media && media.kind === "single" && template.headerType && ["image", "video", "doc"].includes(template.headerType)) {
        const expectedType = template.headerType === "doc" ? "document" : template.headerType;
        if (media.items.some((item) => item.type !== expectedType)) throw new AppError(422, `This template requires ${expectedType} campaign media`, "CAMPAIGN_TEMPLATE_MEDIA_TYPE_INVALID", { expectedType });
        if (media.items.length !== 1) throw new AppError(422, "This template requires exactly one header media item", "CAMPAIGN_TEMPLATE_MEDIA_COUNT_INVALID", { requiredCount: 1, uploadedCount: media.items.length });
      }
      const carouselMediaCount = requiredCampaignCarouselMediaCount(template.templateType, template.content);
      if (input.launchMode !== "draft" && template.templateType === "carousel" && (!media || media.kind !== "carousel" || !media.items.length)) {
        throw new AppError(422, "Upload one media item for every carousel card", "CAMPAIGN_CAROUSEL_MEDIA_REQUIRED", { requiredCount: carouselMediaCount });
      }
      if (input.launchMode !== "draft" && template.templateType === "carousel" && carouselMediaCount !== null && media?.items.length !== carouselMediaCount) throw new AppError(422, `This carousel requires exactly ${carouselMediaCount} media items`, "CAMPAIGN_CAROUSEL_MEDIA_COUNT_INVALID", { requiredCount: carouselMediaCount, uploadedCount: media?.items.length ?? 0 });
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
    if (input.launchMode !== "draft") await assertCampaignTemplateValues(transaction, workspaceId, recipients, input.templateVariables);
    if (input.launchMode !== "draft") {
      const walletEstimate = await estimateWalletForRecipients(workspaceId, input.category, recipients);
      if (!walletEstimate.canCoverEstimate) {
        throw new AppError(402, "Your available wallet balance is not enough to cover the estimated campaign cost. Add funds before launching.", "INSUFFICIENT_WALLET_BALANCE", {
          requiredAmount: walletEstimate.estimatedWalletCost.toFixed(2),
          availableBalance: walletEstimate.wallet.availableBalance,
          currency: walletEstimate.wallet.currency,
        });
      }
    }
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

export async function estimateCampaign(workspaceId: string, input: EstimateCampaignInput) {
  const now = new Date();
  const audience = await prisma.$transaction(async (transaction) => {
    const launchAt = input.launchMode === "schedule" && input.scheduledAt ? new Date(input.scheduledAt) : now;
    await enforceCampaignPlanLimit(transaction, workspaceId, launchAt, now);
    if (!input.templateKey) throw new AppError(422, "Choose an approved WhatsApp template before sending", "CAMPAIGN_TEMPLATE_REQUIRED");
    const template = await transaction.template.findFirst({ where: { workspaceId, templateKey: input.templateKey, deletedAt: null }, select: { status: true, category: true, body: true, headerType: true, headerText: true, templateType: true, content: true } });
    if (!template) throw new AppError(404, "The selected template was not found", "CAMPAIGN_TEMPLATE_NOT_FOUND");
    if (template.status !== "APPROVED") throw new AppError(422, "Only approved templates can be sent", "CAMPAIGN_TEMPLATE_NOT_APPROVED");
    assertCampaignTemplateSupported(template);
    if (input.templateVariables.length !== templateVariableCount(template.body)) throw new AppError(422, "Map every WhatsApp template variable before sending", "CAMPAIGN_TEMPLATE_VARIABLES_REQUIRED");
    const media = campaignTemplateMedia(input.audienceConfig.templateMedia);
    if (template.headerType && ["image", "video", "doc"].includes(template.headerType) && (!media || media.kind !== "single" || media.items.some((item) => item.type !== (template.headerType === "doc" ? "document" : template.headerType)))) throw new AppError(422, "Upload the campaign media required by this template before sending", "CAMPAIGN_TEMPLATE_MEDIA_REQUIRED");
    if (template.headerType && ["image", "video", "doc"].includes(template.headerType) && media?.kind === "single" && media.items.length !== 1) throw new AppError(422, "This template requires exactly one header media item", "CAMPAIGN_TEMPLATE_MEDIA_COUNT_INVALID", { requiredCount: 1, uploadedCount: media.items.length });
    const carouselMediaCount = requiredCampaignCarouselMediaCount(template.templateType, template.content);
    if (template.templateType === "carousel" && (!media || media.kind !== "carousel" || !media.items.length)) throw new AppError(422, "Upload one media item for every carousel card", "CAMPAIGN_CAROUSEL_MEDIA_REQUIRED", { requiredCount: carouselMediaCount });
    if (template.templateType === "carousel" && carouselMediaCount !== null && media?.items.length !== carouselMediaCount) throw new AppError(422, `This carousel requires exactly ${carouselMediaCount} media items`, "CAMPAIGN_CAROUSEL_MEDIA_COUNT_INVALID", { requiredCount: carouselMediaCount, uploadedCount: media?.items.length ?? 0 });
    await ensureWhatsAppReady(transaction, workspaceId);
    const recipients = await resolveRecipients(transaction, workspaceId, input);
    if (!recipients.length) throw new AppError(422, "The campaign audience has no eligible contacts", "CAMPAIGN_AUDIENCE_EMPTY");
    await assertCampaignTemplateValues(transaction, workspaceId, recipients, input.templateVariables);
    let totalAudience = recipients.length;
    if (input.audienceType === "all" || input.audienceType === "contacts" || input.audienceType === "segment") {
      const baseWhere: Prisma.ContactWhereInput = { workspaceId, deletedAt: null };
      let where: Prisma.ContactWhereInput = baseWhere;
      if (input.audienceType === "contacts") where = { ...baseWhere, id: { in: input.contactIds } };
      if (input.audienceType === "segment") {
        const segment = await transaction.contactSegment.findFirst({ where: { id: input.segmentId, workspaceId }, select: { definition: true } });
        if (!segment) throw new AppError(404, "The selected contact segment was not found", "CAMPAIGN_SEGMENT_NOT_FOUND");
        where = { AND: [baseWhere, await contactWhereForSegment(workspaceId, segment.definition as SegmentCondition[])] };
      }
      totalAudience = await transaction.contact.count({ where });
    }
    return { recipients, totalAudience };
  });
  const walletEstimate = await estimateWalletForRecipients(workspaceId, input.category, audience.recipients);
  return {
    recipientCount: audience.recipients.length,
    excludedCount: Math.max(0, audience.totalAudience - audience.recipients.length),
    currency: walletEstimate.wallet.currency,
    estimatedWalletCost: walletEstimate.estimatedWalletCost.toFixed(2),
    estimatedMetaCost: walletEstimate.estimatedMetaCost.toFixed(2),
    availableBalance: walletEstimate.wallet.availableBalance,
    projectedBalance: walletEstimate.availableBalance.sub(walletEstimate.estimatedWalletCost).toFixed(2),
    canCoverEstimate: walletEstimate.canCoverEstimate,
    pricingBasis: input.launchMode === "schedule" ? "Rates may change before the scheduled send." : "Final charges depend on successful message delivery.",
    countries: walletEstimate.countries,
  };
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

export async function controlCampaign(workspaceId: string, campaignId: string, action: CampaignControlAction) {
  const campaign = await requireCampaign(workspaceId, campaignId);
  const now = new Date();
  let allowedStatuses: Array<typeof campaign.status>;
  let nextStatus: typeof campaign.status;
  if (action === "pause") {
    allowedStatuses = ["RUNNING", "SCHEDULED"];
    nextStatus = "PAUSED";
  } else if (action === "resume") {
    allowedStatuses = ["PAUSED"];
    nextStatus = campaign.scheduledAt && campaign.scheduledAt > now ? "SCHEDULED" : "RUNNING";
  } else {
    allowedStatuses = ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"];
    nextStatus = "CANCELLED";
  }
  if (!allowedStatuses.includes(campaign.status)) {
    throw new AppError(409, `A ${campaign.status.toLowerCase()} campaign cannot be ${action === "cancel" ? "cancelled" : `${action}d`}`, "CAMPAIGN_CONTROL_CONFLICT");
  }
  const updated = await prisma.campaign.updateMany({
    where: { id: campaignId, workspaceId, status: campaign.status },
    data: { status: nextStatus },
  });
  if (!updated.count) throw new AppError(409, "The campaign changed before this action could be applied. Refresh and try again.", "CAMPAIGN_CONTROL_CONFLICT");
  publishCampaignUpdated(workspaceId, campaignId);
  return getCampaign(workspaceId, campaignId);
}

export async function deleteCampaign(workspaceId: string, campaignId: string) {
  const campaign = await requireCampaign(workspaceId, campaignId);
  if (["RUNNING", "SCHEDULED"].includes(campaign.status)) throw new AppError(409, "Pause or finish a live campaign before deleting it", "CAMPAIGN_ACTIVE");
  await prisma.campaign.delete({ where: { id: campaignId, workspaceId } });
}

export { templateVariableCount };
