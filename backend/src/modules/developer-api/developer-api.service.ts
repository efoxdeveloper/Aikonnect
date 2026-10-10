import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error-handler.js";
import { hashToken } from "../../utils/crypto.js";
import { reserveMessageBilling, releaseMessageBilling } from "../billing/billing.service.js";
import { resolveMessagePricing, type PricingSnapshot, messagePricingSnapshot } from "../whatsapp-pricing/pricing.service.js";
import { sendWhatsAppAudioMessage, sendWhatsAppDocumentMessage, sendWhatsAppImageMessage, sendWhatsAppInteractiveButtonMessage, sendWhatsAppStickerMessage, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage, sendWhatsAppVideoMessage, type WhatsAppTemplateButtonParameter, type WhatsAppTemplateCarouselCard, type WhatsAppTemplateHeaderParameter, type WhatsAppTemplateParameter } from "../whatsapp/whatsapp.service.js";
import { enqueueMessageWebhook } from "../webhooks/webhook.service.js";
import { enforceContactPlanLimit } from "../contacts/contact-plan-limits.js";
import { normalizeDeveloperApiLanguageCode, publicMessageSchema, type CreateApiCampaignInput, type PublicMessageInput, type PublicTemplateMessageInput, type PublicTextMessageInput, type SendMessageInput } from "./developer-api.schemas.js";

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
  const data = "data" in input ? input.data : { template: input.template, campaignId: input.campaignId, template_category: input.template_category };
  return `public:${hashToken(JSON.stringify({ workspaceId, to, callbackData: input.callbackData, userId: input.userId ?? null, type: input.type, data }))}`;
}

function publicMessageText(input: PublicMessageInput) {
  if (input.type === "Template") return input.template.name;
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

function templateHeaderParameters(input: PublicTemplateMessageInput, headerType: string) {
  if (headerType === "doc" || headerType === "document") {
    return [{ type: "document" as const, document: { link: input.template.headerValues[0]!, filename: input.template.fileName! } }];
  }
  if (headerType === "image") {
    return [{ type: "image" as const, image: { link: input.template.headerValues[0]! } }];
  }
  return templateParameters(input.template.headerValues);
}

export function buildPublicTemplateButtonParameters(input: PublicTemplateMessageInput, contentValue: unknown): WhatsAppTemplateButtonParameter[] {
  const parameters: WhatsAppTemplateButtonParameter[] = Object.entries(input.template.buttonValues).map(([index, values]) => ({ subType: "url", index, parameters: templateParameters(values) }));
  const orderDetails = input.template.order_details?.[0];
  if (orderDetails) {
    const content = templateRecord(contentValue);
    const components = Array.isArray(content.metaComponents) ? content.metaComponents.map(templateRecord) : [];
    const buttonsComponent = components.find((component) => String(component.type ?? "").toUpperCase() === "BUTTONS");
    const buttons = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons.map(templateRecord) : [];
    const index = buttons.findIndex((button) => ["ORDER_DETAILS", "ORDER_DETAILS_BUTTON"].includes(String(button.type ?? "").toUpperCase()));
    if (index >= 0) parameters.push({
      subType: "order_details",
      index: String(index),
      parameters: [{ type: "action", action: { order_details: metaOrderDetails(orderDetails) } }],
    });
  }
  return parameters;
}

function templateOrderStatus(input: PublicTemplateMessageInput) {
  const value = input.template.order_status;
  return value ? {
    reference_id: value.reference_id,
    order: {
      status: value.order.status,
      ...(value.order.description ? { description: value.order.description } : {}),
    },
  } : undefined;
}

function orderAmount(value: number) {
  return { offset: 100, value: Math.round(value * 100) };
}

function metaOrderDetails(value: NonNullable<PublicTemplateMessageInput["template"]["order_details"]>[number]) {
  return {
    reference_id: value.reference_id,
    type: value.shipping_addresses?.length ? "physical-goods" : "digital-goods",
    currency: value.currency,
    total_amount: orderAmount(value.total_amount),
    order: {
      status: "pending",
      items: value.order_items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        amount: orderAmount(item.amount),
        ...(item.country_of_origin ? { country_of_origin: item.country_of_origin } : {}),
      })),
      subtotal: orderAmount(value.subtotal),
      discount: orderAmount(value.discount),
      tax: orderAmount(value.tax),
      shipping: orderAmount(value.shipping),
      ...(value.shipping_addresses?.length ? { shipping_addresses: value.shipping_addresses } : {}),
    },
    ...(value.payment_option_expires_in ? { payment_option_expires_in: value.payment_option_expires_in } : {}),
  };
}

function templateCarouselCards(input: PublicTemplateMessageInput, contentValue: unknown): WhatsAppTemplateCarouselCard[] {
  const template = templateRecord(contentValue);
  const metaComponents = Array.isArray(template.metaComponents) ? template.metaComponents.map(templateRecord) : [];
  const carousel = metaComponents.find((component) => String(component.type ?? "").toUpperCase() === "CAROUSEL");
  const metadataCards = Array.isArray(carousel?.cards) ? carousel.cards.map(templateRecord) : [];
  return (input.template.carouselCards ?? []).map((card, cardIndex) => {
    const metadata = metadataCards[cardIndex] ?? {};
    const components = Array.isArray(metadata.components) ? metadata.components.map(templateRecord) : [];
    const header = components.find((component) => String(component.type ?? "").toUpperCase() === "HEADER");
    const format = String(header?.format ?? "IMAGE").toUpperCase();
    let headerParameters: WhatsAppTemplateHeaderParameter[] = [];
    if (card.headerValues.length) {
      const value = card.headerValues[0]!;
      if (format === "VIDEO") headerParameters = [{ type: "video", video: { link: value } }];
      else if (format === "DOCUMENT") headerParameters = [{ type: "document", document: { link: value } }];
      else if (format === "TEXT") headerParameters = templateParameters(card.headerValues);
      else headerParameters = [{ type: "image", image: { link: value } }];
    }
    const buttonParameters: WhatsAppTemplateButtonParameter[] = Object.entries(card.buttonValues).map(([index, values]) => ({ subType: "url", index, parameters: templateParameters(values) }));
    const buttonComponent = components.find((component) => String(component.type ?? "").toUpperCase() === "BUTTONS");
    const buttonRecords = Array.isArray(buttonComponent?.buttons) ? buttonComponent.buttons.map(templateRecord) : [];
    const orderDetailsButtonIndex = buttonRecords.findIndex((button) => ["ORDER_DETAILS", "ORDER_DETAILS_BUTTON"].includes(String(button.type ?? "").toUpperCase()));
    const orderDetails = input.template.order_details?.[cardIndex];
    if (orderDetails && orderDetailsButtonIndex >= 0) {
      buttonParameters.push({
        subType: "order_details",
        index: String(orderDetailsButtonIndex),
        parameters: [{ type: "action", action: { order_details: metaOrderDetails(orderDetails) } }],
      });
    }
    return {
      headerParameters,
      bodyParameters: templateParameters(card.bodyValues),
      buttonParameters,
    };
  });
}

function templateVariableCount(value: string | null | undefined) {
  return Math.max(0, ...[...(value ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])));
}

function templateRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function templateCarouselMetadata(contentValue: unknown) {
  const content = templateRecord(contentValue);
  const components = Array.isArray(content.metaComponents) ? content.metaComponents.map(templateRecord) : [];
  const carousel = components.find((component) => String(component.type ?? "").toUpperCase() === "CAROUSEL");
  return Array.isArray(carousel?.cards) ? carousel.cards.map(templateRecord) : [];
}

function dynamicUrlButtonVariablesInComponents(components: Record<string, unknown>[]) {
  const buttonsComponent = components.find((component) => String(component.type ?? "").toUpperCase() === "BUTTONS");
  const dynamicButtons = new Map<string, number>();
  if (Array.isArray(buttonsComponent?.buttons)) {
    buttonsComponent.buttons.forEach((rawButton, index) => {
      const button = templateRecord(rawButton);
      const variableCount = String(button.type ?? "").toUpperCase() === "URL" ? templateVariableCount(typeof button.url === "string" ? button.url : null) : 0;
      if (variableCount > 0) dynamicButtons.set(String(index), variableCount);
    });
  }
  return dynamicButtons;
}

function dynamicUrlButtonVariables(contentValue: unknown) {
  const content = templateRecord(contentValue);
  const components = Array.isArray(content.metaComponents) ? content.metaComponents.map(templateRecord) : [];
  const metadataButtons = dynamicUrlButtonVariablesInComponents(components);
  if (metadataButtons.size || components.some((component) => String(component.type ?? "").toUpperCase() === "BUTTONS")) return metadataButtons;

  const buttonTypes = Array.isArray(content.buttons) ? content.buttons : [];
  const quickReplies = Array.isArray(content.quickReplies) ? content.quickReplies : [];
  let buttonIndex = 0;
  const dynamicButtons = new Map<string, number>();
  for (const rawType of buttonTypes) {
    const type = typeof rawType === "string" ? rawType.toLowerCase() : "";
    if (type === "quick-reply") {
      buttonIndex += Math.max(1, quickReplies.length);
    } else {
      if (type === "website") {
        const variableCount = templateVariableCount(typeof content.websiteUrl === "string" ? content.websiteUrl : null);
        if (variableCount) dynamicButtons.set(String(buttonIndex), variableCount);
      }
      buttonIndex += 1;
    }
  }
  return dynamicButtons;
}

function normalizeTemplateLanguage(value: string) {
  const aliases: Record<string, string> = { Hindi: "hi" };
  return normalizeDeveloperApiLanguageCode(aliases[value] ?? value);
}

export function validatePublicCarouselCardValues(input: PublicTemplateMessageInput, contentValue: unknown) {
  const templateCards = templateCarouselMetadata(contentValue);
  const providedCards = input.template.carouselCards;
  if (!templateCards.length) throw new AppError(422, "The carousel template is missing its card metadata", "TEMPLATE_CAROUSEL_METADATA_INVALID");
  if (!providedCards || providedCards.length !== templateCards.length) {
    throw new AppError(422, "Provide values for every card in the carousel template", "TEMPLATE_CAROUSEL_CARDS_INVALID", { expectedCount: templateCards.length, providedCount: providedCards?.length ?? 0 });
  }
  const orderDetails = input.template.order_details;
  const orderDetailsButtonIndexes = templateCards.map((card) => {
    const components = Array.isArray(card.components) ? card.components.map(templateRecord) : [];
    const buttonComponent = components.find((component) => String(component.type ?? "").toUpperCase() === "BUTTONS");
    const buttons = Array.isArray(buttonComponent?.buttons) ? buttonComponent.buttons.map(templateRecord) : [];
    return buttons.findIndex((button) => ["ORDER_DETAILS", "ORDER_DETAILS_BUTTON"].includes(String(button.type ?? "").toUpperCase()));
  });
  const hasOrderDetailsButton = orderDetailsButtonIndexes.some((index) => index >= 0);
  if (hasOrderDetailsButton && (!orderDetails || orderDetails.length !== templateCards.length || orderDetailsButtonIndexes.some((index) => index < 0))) {
    throw new AppError(422, "Provide one order_details object for every carousel card with an order details button", "TEMPLATE_ORDER_DETAILS_INVALID", { expectedCount: templateCards.length, providedCount: orderDetails?.length ?? 0 });
  }
  if (!hasOrderDetailsButton && orderDetails) {
    throw new AppError(422, "order_details can only be used with a carousel template that has order details buttons", "TEMPLATE_ORDER_DETAILS_INVALID");
  }
  if (orderDetails) {
    const references = orderDetails.map((details) => details.reference_id);
    if (new Set(references).size !== references.length) throw new AppError(422, "Each carousel card must use a unique order reference_id", "TEMPLATE_ORDER_DETAILS_INVALID");
    orderDetails.forEach((details, cardIndex) => {
      const expectedTotal = details.subtotal - details.discount + details.tax + details.shipping;
      if (Math.abs(details.total_amount - expectedTotal) > 0.01) {
        throw new AppError(422, "Order total_amount must equal subtotal minus discount plus tax and shipping", "TEMPLATE_ORDER_TOTAL_INVALID", { cardIndex });
      }
    });
  }

  providedCards.forEach((card, cardIndex) => {
    const cardMetadata = templateCards[cardIndex]!;
    const components = Array.isArray(cardMetadata.components) ? cardMetadata.components.map(templateRecord) : [];
    const header = components.find((component) => String(component.type ?? "").toUpperCase() === "HEADER");
    const headerFormat = String(header?.format ?? "").toUpperCase();
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      if (card.headerValues.length !== 1) throw new AppError(422, "Each carousel card media header requires one media URL", "TEMPLATE_CAROUSEL_HEADER_VALUES_INVALID", { cardIndex, expectedCount: 1, providedCount: card.headerValues.length });
      let mediaUrl: URL;
      try { mediaUrl = new URL(card.headerValues[0]!); } catch { throw new AppError(422, "Carousel card media values must be valid http or https URLs", "TEMPLATE_CAROUSEL_MEDIA_URL_INVALID", { cardIndex }); }
      if (mediaUrl.protocol !== "http:" && mediaUrl.protocol !== "https:") throw new AppError(422, "Carousel card media values must be valid http or https URLs", "TEMPLATE_CAROUSEL_MEDIA_URL_INVALID", { cardIndex });
    } else if (headerFormat === "TEXT") {
      const expectedCount = templateVariableCount(typeof header?.text === "string" ? header.text : null);
      if (card.headerValues.length !== expectedCount) throw new AppError(422, "Provide one header value for every carousel card header variable", "TEMPLATE_CAROUSEL_HEADER_VALUES_INVALID", { cardIndex, expectedCount, providedCount: card.headerValues.length });
    } else if (card.headerValues.length) {
      throw new AppError(422, "Header values are not supported by this carousel card", "TEMPLATE_CAROUSEL_HEADER_VALUES_INVALID", { cardIndex });
    }

    const body = components.find((component) => String(component.type ?? "").toUpperCase() === "BODY");
    const bodyVariableCount = templateVariableCount(typeof body?.text === "string" ? body.text : null);
    if (card.bodyValues.length !== bodyVariableCount) throw new AppError(422, "Provide one body value for every carousel card body variable", "TEMPLATE_CAROUSEL_BODY_VALUES_INVALID", { cardIndex, expectedCount: bodyVariableCount, providedCount: card.bodyValues.length });

    const dynamicButtons = dynamicUrlButtonVariablesInComponents(components);
    for (const [index, expectedCount] of dynamicButtons) {
      const values = card.buttonValues[index];
      if (!values || values.length !== expectedCount) throw new AppError(422, "Provide one button value for every dynamic URL variable in this carousel card", "TEMPLATE_CAROUSEL_BUTTON_VALUES_INVALID", { cardIndex, expectedIndex: index, expectedCount, providedCount: values?.length ?? 0 });
    }
    for (const [index, values] of Object.entries(card.buttonValues)) {
      const expectedCount = dynamicButtons.get(index);
      if (!expectedCount || values.length !== expectedCount) throw new AppError(422, "Carousel buttonValues must match a dynamic URL button on that card", "TEMPLATE_CAROUSEL_BUTTON_VALUES_INVALID", { cardIndex, providedIndex: index, expectedButtonIndexes: [...dynamicButtons.keys()] });
    }
  });
}

export function validatePublicSingleOrderDetails(input: PublicTemplateMessageInput, contentValue: unknown) {
  const orderDetails = input.template.order_details;
  if (!orderDetails) return;
  const content = templateRecord(contentValue);
  const components = Array.isArray(content.metaComponents) ? content.metaComponents.map(templateRecord) : [];
  const buttonsComponent = components.find((component) => String(component.type ?? "").toUpperCase() === "BUTTONS");
  const buttons = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons.map(templateRecord) : [];
  const hasOrderDetailsButton = buttons.some((button) => ["ORDER_DETAILS", "ORDER_DETAILS_BUTTON"].includes(String(button.type ?? "").toUpperCase()));
  if (orderDetails.length !== 1 || !hasOrderDetailsButton) {
    throw new AppError(422, "Provide one order_details object for a standard template with an order details button", "TEMPLATE_ORDER_DETAILS_INVALID", { expectedCount: 1, providedCount: orderDetails.length });
  }
  const details = orderDetails[0]!;
  const expectedTotal = details.subtotal - details.discount + details.tax + details.shipping;
  if (Math.abs(details.total_amount - expectedTotal) > 0.01) {
    throw new AppError(422, "Order total_amount must equal subtotal minus discount plus tax and shipping", "TEMPLATE_ORDER_TOTAL_INVALID");
  }
}

async function resolvePublicTemplate(workspaceId: string, input: PublicTemplateMessageInput) {
  const templates = await prisma.template.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      OR: [
        { metaTemplateName: { equals: input.template.name, mode: "insensitive" } },
        { name: { equals: input.template.name, mode: "insensitive" } },
        { templateKey: { equals: input.template.name, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, templateKey: true, metaTemplateName: true, metaLanguageCode: true, language: true, category: true, templateType: true, headerType: true, headerText: true, body: true, content: true, status: true },
  });
  if (!templates.length) throw new AppError(404, "The WhatsApp template was not found in this workspace", "TEMPLATE_NOT_FOUND");
  const template = templates.find((candidate) => normalizeTemplateLanguage(candidate.metaLanguageCode ?? candidate.language) === input.template.languageCode);
  if (!template) throw new AppError(422, "The language code does not match the WhatsApp template", "TEMPLATE_LANGUAGE_MISMATCH", { availableLanguageCodes: templates.map((candidate) => normalizeTemplateLanguage(candidate.metaLanguageCode ?? candidate.language)) });
  if (template.status !== "APPROVED") throw new AppError(422, "Only approved WhatsApp templates can be sent", "TEMPLATE_NOT_APPROVED");
  if (template.templateType !== "standard" && template.templateType !== "carousel") throw new AppError(422, "This API supports standard and carousel WhatsApp templates", "TEMPLATE_TYPE_UNSUPPORTED");
  if (input.template.order_status && template.templateType !== "standard") throw new AppError(422, "order_status can only be used with a standard order status template", "TEMPLATE_ORDER_STATUS_INVALID");
  if (input.template.order_status && input.template.order_details) throw new AppError(422, "order_status and order_details cannot be sent together", "TEMPLATE_ORDER_STATUS_INVALID");

  const bodyVariableCount = templateVariableCount(template.body);
  if (input.template.bodyValues.length !== bodyVariableCount) {
    throw new AppError(422, "Provide one body value for every template body variable", "TEMPLATE_BODY_VALUES_INVALID", { expectedCount: bodyVariableCount, providedCount: input.template.bodyValues.length });
  }
  const headerVariableCount = template.headerType === "text" ? templateVariableCount(template.headerText) : 0;
  if (template.headerType === "text" && input.template.headerValues.length !== headerVariableCount) {
    throw new AppError(422, "Provide one header value for every text header variable", "TEMPLATE_HEADER_VALUES_INVALID", { expectedCount: headerVariableCount, providedCount: input.template.headerValues.length });
  }
  const documentHeader = template.headerType === "doc" || template.headerType === "document";
  const imageHeader = template.headerType === "image";
  if (documentHeader || imageHeader) {
    if (input.template.headerValues.length !== 1) {
      throw new AppError(422, "An image or document header requires one media URL", "TEMPLATE_HEADER_VALUES_INVALID", { expectedCount: 1, providedCount: input.template.headerValues.length });
    }
    if (documentHeader && !input.template.fileName) {
      throw new AppError(422, "A document header requires a fileName", "TEMPLATE_HEADER_VALUES_INVALID", { expectedCount: 1, providedCount: input.template.headerValues.length });
    }
    if (imageHeader && input.template.fileName) {
      throw new AppError(422, "An image header does not accept a fileName", "TEMPLATE_HEADER_VALUES_INVALID", { headerType: template.headerType });
    }
    let mediaUrl: URL;
    try {
      mediaUrl = new URL(input.template.headerValues[0]!);
    } catch {
      throw new AppError(422, "The media header value must be a valid http or https URL", "TEMPLATE_HEADER_MEDIA_URL_INVALID");
    }
    if (mediaUrl.protocol !== "http:" && mediaUrl.protocol !== "https:") {
      throw new AppError(422, "The media header value must be a valid http or https URL", "TEMPLATE_HEADER_MEDIA_URL_INVALID");
    }
  } else if ((template.headerType !== "text" && input.template.headerValues.length) || input.template.fileName) {
    throw new AppError(422, "Header values require an approved text, image, or document header template", "TEMPLATE_HEADER_VALUES_INVALID", { headerType: template.headerType });
  }
  const templateCategory = template.category.trim().toUpperCase();
  if (input.template_category && input.template_category !== templateCategory) {
    throw new AppError(422, "template_category does not match the selected WhatsApp template", "TEMPLATE_CATEGORY_MISMATCH", { expectedCategory: templateCategory });
  }
  const buttonValueEntries = Object.entries(input.template.buttonValues);
  if (templateCategory === "AUTHENTICATION") {
    if (buttonValueEntries.length !== 1 || buttonValueEntries[0]?.[0] !== "0" || buttonValueEntries[0]?.[1].length !== 1) {
      throw new AppError(422, "Authentication templates require one button value at index 0", "TEMPLATE_BUTTON_VALUES_INVALID", { expectedIndex: "0", expectedCount: 1 });
    }
  } else if (template.templateType === "carousel") {
    if (buttonValueEntries.length) throw new AppError(422, "Carousel button values must be provided inside their carouselCards entry", "TEMPLATE_BUTTON_VALUES_INVALID");
    validatePublicCarouselCardValues(input, template.content);
  } else {
    if (input.template.carouselCards) throw new AppError(422, "carouselCards can only be used with a carousel template", "TEMPLATE_CAROUSEL_CARDS_INVALID");
    validatePublicSingleOrderDetails(input, template.content);
    const dynamicButtons = dynamicUrlButtonVariables(template.content);
    for (const [index, expectedCount] of dynamicButtons) {
      const values = input.template.buttonValues[index];
      if (!values || values.length !== expectedCount) {
        throw new AppError(422, "Provide one button value for every variable in the dynamic URL button", "TEMPLATE_BUTTON_VALUES_INVALID", { expectedIndex: index, expectedCount, providedCount: values?.length ?? 0 });
      }
    }
    for (const [index, values] of buttonValueEntries) {
      const expectedCount = dynamicButtons.get(index);
      if (!expectedCount || values.length !== expectedCount) {
        throw new AppError(422, "buttonValues must match a dynamic URL button in the selected template", "TEMPLATE_BUTTON_VALUES_INVALID", { providedIndex: index, expectedButtonIndexes: [...dynamicButtons.keys()] });
      }
    }
  }
  if (input.campaignId) {
    const campaign = await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId }, select: { kind: true, templateKey: true } });
    if (!campaign) throw new AppError(404, "The campaign was not found in this workspace", "CAMPAIGN_NOT_FOUND");
    if (campaign.kind !== "API") throw new AppError(422, "The campaign is not an API campaign", "CAMPAIGN_TYPE_INVALID");
    if (campaign.templateKey !== template.templateKey) throw new AppError(422, "The selected campaign uses a different WhatsApp template", "CAMPAIGN_TEMPLATE_MISMATCH");
  }
  return template;
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function createApiCampaign(workspaceId: string, input: CreateApiCampaignInput) {
  const templates = await prisma.template.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      OR: [
        { metaTemplateName: { equals: input.template_name, mode: "insensitive" } },
        { name: { equals: input.template_name, mode: "insensitive" } },
        { templateKey: { equals: input.template_name, mode: "insensitive" } },
      ],
    },
    select: { name: true, templateKey: true, metaTemplateName: true, metaLanguageCode: true, language: true, category: true, body: true, status: true },
  });
  if (!templates.length) throw new AppError(404, "The WhatsApp template was not found in this workspace", "CAMPAIGN_TEMPLATE_NOT_FOUND");
  const templateLanguage = (template: (typeof templates)[number]) => normalizeTemplateLanguage(template.metaLanguageCode ?? template.language);
  const template = templates.find((candidate) => templateLanguage(candidate) === input.language_code);
  if (!template) throw new AppError(422, "The language code does not match the WhatsApp template", "CAMPAIGN_TEMPLATE_LANGUAGE_MISMATCH", { availableLanguageCodes: templates.map(templateLanguage) });
  if (template.status !== "APPROVED") throw new AppError(422, "Only approved templates can be used for API campaigns", "CAMPAIGN_TEMPLATE_NOT_APPROVED");

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      name: input.campaign_name,
      kind: "API",
      category: template.category,
      templateKey: template.templateKey,
      templateName: template.name,
      metaTemplateName: template.metaTemplateName ?? template.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
      templateLanguageCode: input.language_code,
      templateBody: template.body,
      templateVariables: [],
      buttonTracking: [],
      audienceType: "all",
      audienceLabel: "Public API",
      audienceConfig: { source: "developer_api" },
      createdById: null,
    },
    select: { id: true, name: true },
  });
  return { campaignId: campaign.id, name: campaign.name };
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
  const languageCode = input.languageCode ?? normalizeTemplateLanguage(template.metaLanguageCode ?? template.language);
  if (!languageCode) throw new AppError(422, "The template is missing its language code", "TEMPLATE_NOT_READY");

  let created: { messageId: string; conversationId: string };
  try {
    created = await prisma.$transaction(async (transaction) => {
      const existingContact = await transaction.contact.findFirst({ where: { workspaceId, phoneE164: to, deletedAt: null }, select: { id: true, whatsappOpted: true, marketingBlocked: true } });
      if (existingContact && (!existingContact.whatsappOpted || existingContact.marketingBlocked)) throw new AppError(422, "The recipient is not eligible for WhatsApp messaging", "CONTACT_NOT_WHATSAPP_ELIGIBLE");
      if (!existingContact) await enforceContactPlanLimit(transaction, workspaceId, 1);
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
      await enqueueMessageWebhook(created.messageId, "message.sent", transaction);
    });
    return { replayed: false, data: { ...(await serializeMessage(created.messageId)), clientReference: input.clientReference ?? null, billing: billing.billing } };
  } catch (error) {
    if (reservationId && !metaAccepted) await releaseMessageBilling(created.messageId, error instanceof Error ? error.message : "Meta rejected the message").catch(() => undefined);
    await prisma.message.update({ where: { id: created.messageId }, data: metaAccepted
      ? { metaMessageId: metaAccepted.metaMessageId, status: "SENT", sentAt: metaAccepted.sentAt, billingError: "Meta accepted the message but the response could not be persisted" }
      : { status: "FAILED", failedAt: new Date(), failureReason: error instanceof Error ? error.message : "Developer API send failed", billingStatus: reservationId ? "RELEASED" : billingResolved ? "NOT_APPLICABLE" : "BILLING_ERROR", billingError: error instanceof Error ? error.message : "Developer API billing/send failed" } }).catch(() => undefined);
    if (metaAccepted) await enqueueMessageWebhook(created.messageId, "message.sent").catch((webhookError) => logger.error({ messageId: created.messageId, error: webhookError }, "Failed to queue the developer API sent webhook"));
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

  const template = input.type === "Template" ? await resolvePublicTemplate(workspaceId, input) : null;
  const pricing = await resolveMessagePricing({ phoneNumber: to, category: template?.category ?? "UTILITY", pricingType: "REGULAR" });
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
      if (!existingContact) await enforceContactPlanLimit(transaction, workspaceId, 1);
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
          mediaUrl: input.type === "Image" || input.type === "Document" || input.type === "Video" || input.type === "Audio" || input.type === "Sticker" ? input.data.mediaUrl : null,
          apiIdempotencyKey: idempotencyKey,
          ...messagePricingSnapshot(pricing),
          payload: {
            source: "public_api",
            request: input,
            userId: input.userId ?? null,
            callbackData: input.callbackData ?? null,
            clientReference: input.callbackData ?? null,
            messageType: input.type,
            ...(input.type === "Image" || input.type === "Document" || input.type === "Video" || input.type === "Audio" || input.type === "Sticker" ? { mediaUrl: input.data.mediaUrl } : {}),
            ...((input.type === "Document" || input.type === "Video" || input.type === "Audio") && input.data.fileName ? { fileName: input.data.fileName } : {}),
            ...(input.type === "InteractiveButton" ? { interactive: input.data.message } : {}),
            ...(input.type === "Template" ? { campaignId: input.campaignId ?? null, template: { ...input.template, name: template?.metaTemplateName ?? template?.name ?? input.template.name, languageCode: template ? normalizeTemplateLanguage(template.metaLanguageCode ?? template.language) : input.template.languageCode } } : {}),
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
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.message.updateMany({ where: { id: created.messageId, status: "QUEUED" }, data: { status: "FAILED", failedAt: new Date(), failureReason: error instanceof Error ? error.message : "Public API billing failed", billingStatus: "BILLING_ERROR", billingError: error instanceof Error ? error.message : "Public API billing failed" } });
      if (updated.count) await enqueueMessageWebhook(created.messageId, "message.failed", transaction);
    }).catch(() => undefined);
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
    const template = input.type === "Template" ? await resolvePublicTemplate(message.workspaceId, input) : null;
    metaAccepted = input.type === "Template"
      ? await sendWhatsAppTemplateMessage(
        message.workspaceId,
        to,
        template!.metaTemplateName ?? template!.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        normalizeTemplateLanguage(template!.metaLanguageCode ?? input.template.languageCode),
        templateParameters(input.template.bodyValues),
        undefined,
        undefined,
        templateHeaderParameters(input, template!.headerType),
        buildPublicTemplateButtonParameters(input, template!.content),
        template!.templateType === "carousel" ? templateCarouselCards(input, template!.content) : undefined,
        templateOrderStatus(input),
      )
      : input.type === "Image"
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
      await enqueueMessageWebhook(message.id, "message.sent", transaction);
    });
    return true;
  } catch (error) {
    if (metaAccepted) {
      await prisma.message.update({ where: { id: message.id }, data: { metaMessageId: metaAccepted.metaMessageId, status: "SENT", sentAt: metaAccepted.sentAt, queueProcessingToken: null, queueProcessingAt: null, queueNextAttemptAt: null, billingError: "Meta accepted the message but the response could not be persisted" } }).catch(() => undefined);
      await enqueueMessageWebhook(message.id, "message.sent").catch((webhookError) => logger.error({ messageId: message.id, error: webhookError }, "Failed to queue the public API sent webhook"));
      return true;
    }
    throw error;
  }
}

export async function sendPublicTextMessage(workspaceId: string, input: PublicTextMessageInput) {
  return sendPublicMessage(workspaceId, input);
}
