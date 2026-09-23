import { AppError } from "../../middleware/error-handler.js";
import type { CreateTemplateInput, UpdateTemplateInput } from "./template.schemas.js";

type TemplateInput = CreateTemplateInput | UpdateTemplateInput;
type JsonRecord = Record<string, unknown>;
type MetaComponent = JsonRecord;

const CATEGORY_MAP = {
  MARKETING: "MARKETING",
  Marketing: "MARKETING",
  UTILITY: "UTILITY",
  Utility: "UTILITY",
  AUTHENTICATION: "AUTHENTICATION",
  Authentication: "AUTHENTICATION",
} as const;

export function languageCode(value: string): string {
  const aliases: Record<string, string> = {
    English: "en_US",
    Hindi: "hi",
    "English (US)": "en_US",
    "English (UK)": "en_GB",
  };
  const result = aliases[value.trim()] ?? value.trim().replace(/-/g, "_");
  if (!/^[a-z]{2,3}(?:_[A-Z]{2}|_[0-9]{3})?$/.test(result)) {
    throw new AppError(422, "Use a valid Meta language code such as en_US or hi", "META_TEMPLATE_LANGUAGE_INVALID");
  }
  return result;
}

/** Meta names are lower-case ASCII identifiers. The local display name is not changed. */
export function normalizeMetaTemplateName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 512);
  if (!normalized || !/^[a-z0-9_]+$/.test(normalized)) {
    throw new AppError(422, "Template name must contain lowercase letters, numbers, and underscores", "META_TEMPLATE_NAME_INVALID");
  }
  return normalized;
}

export const metaTemplateName = normalizeMetaTemplateName;

export function metaCategory(value: string): "MARKETING" | "UTILITY" | "AUTHENTICATION" {
  const category = CATEGORY_MAP[value as keyof typeof CATEGORY_MAP];
  if (!category) throw new AppError(422, "Choose Marketing, Utility, or Authentication", "META_TEMPLATE_CATEGORY_INVALID");
  return category;
}

function contentOf(input: TemplateInput): JsonRecord {
  return input.content && typeof input.content === "object" && !Array.isArray(input.content)
    ? input.content as JsonRecord
    : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function variableNumbers(value: string): number[] {
  return [...value.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
}

export function validateVariables(text: string, examples: string[], field: "body" | "header" | "url"): number[] {
  const numbers = variableNumbers(text);
  const malformed = [...text.matchAll(/\{\{([^}]*)\}\}/g)].some((match) => !/^\s*\d+\s*$/.test(match[1] ?? ""));
  const max = Math.max(0, ...numbers);
  const expected = Array.from({ length: max }, (_, index) => index + 1);
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (malformed || unique.some((value, index) => value !== expected[index])) {
    throw new AppError(422, `${field === "body" ? "Body" : field === "header" ? "Header" : "URL"} variables must be numbered sequentially starting at {{1}}`, "META_TEMPLATE_VARIABLES_INVALID", { field });
  }
  if (examples.length !== unique.length || examples.some((example) => !example)) {
    throw new AppError(422, `${field === "body" ? "Body" : field === "header" ? "Header" : "URL"} variable examples must match the number and order of variables`, "META_TEMPLATE_VARIABLE_EXAMPLES_INVALID", { field, expected: unique.length, received: examples.length });
  }
  return unique;
}

function bodyExamples(content: JsonRecord): string[] {
  return stringArray(content.bodyExamples ?? content.bodyExampleValues);
}

function headerExamples(content: JsonRecord): string[] {
  return stringArray(content.headerExamples ?? content.headerExampleValues);
}

function buildBodyComponent(input: TemplateInput, content: JsonRecord): MetaComponent {
  const text = nonEmptyString(input.body);
  if (!text) throw new AppError(422, "Template body is required", "META_TEMPLATE_BODY_REQUIRED");
  const examples = bodyExamples(content);
  const variables = validateVariables(text, examples, "body");
  return {
    type: "BODY",
    text,
    ...(variables.length ? { example: { body_text: [examples] } } : {}),
  };
}

function buildHeaderComponent(input: TemplateInput, content: JsonRecord): MetaComponent | undefined {
  const headerType = input.headerType ?? "none";
  if (headerType === "none") return undefined;
  if (headerType === "text") {
    const text = nonEmptyString(input.headerText);
    if (!text) throw new AppError(422, "A text header must contain header text", "META_TEMPLATE_HEADER_REQUIRED");
    const examples = headerExamples(content);
    const variables = validateVariables(text, examples, "header");
    if (variables.length > 1) throw new AppError(422, "Meta text headers support one variable", "META_TEMPLATE_HEADER_VARIABLES_INVALID");
    return { type: "HEADER", format: "TEXT", text, ...(variables.length ? { example: { header_text: examples } } : {}) };
  }
  if (headerType === "location") return { type: "HEADER", format: "LOCATION" };
  if (headerType === "image" || headerType === "video" || headerType === "doc") {
    const handle = nonEmptyString(content.headerHandle ?? content.mediaHandle);
    if (!handle) throw new AppError(422, "Upload the header media before submitting this template", "META_TEMPLATE_MEDIA_HANDLE_REQUIRED");
    const format = headerType === "doc" ? "DOCUMENT" : headerType.toUpperCase();
    return { type: "HEADER", format, example: { header_handle: [handle] } };
  }
  throw new AppError(422, "This header type is not supported by Meta", "META_TEMPLATE_HEADER_UNSUPPORTED");
}

function buttonText(content: JsonRecord, id: string, fallback: string): string {
  const texts = content.buttonTexts && typeof content.buttonTexts === "object" && !Array.isArray(content.buttonTexts)
    ? content.buttonTexts as JsonRecord
    : {};
  const text = nonEmptyString(texts[id]) ?? fallback;
  if (text.length > 25) throw new AppError(422, "Button text must be 1 to 25 characters", "META_TEMPLATE_BUTTON_TEXT_INVALID", { buttonType: id });
  return text;
}

function validateUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
    return url;
  } catch {
    throw new AppError(422, "Website buttons require a valid http(s) URL", "META_TEMPLATE_BUTTON_URL_INVALID");
  }
}

function phoneNumber(value: unknown): string {
  const phone = typeof value === "string" ? value.trim().replace(/[\s().-]/g, "").replace(/^\+/, "") : "";
  if (!/^\d{7,15}$/.test(phone)) throw new AppError(422, "Call buttons require a valid phone number with country code", "META_TEMPLATE_PHONE_NUMBER_INVALID");
  return phone;
}

function buildFlowButton(content: JsonRecord): JsonRecord {
  const flowId = nonEmptyString(content.flowId);
  const flowName = nonEmptyString(content.flowName);
  const screen = nonEmptyString(content.flowNavigateScreen);
  if ((!flowId && !flowName) || (flowId && flowName)) throw new AppError(422, "Flow buttons require exactly one Flow ID or Flow name", "META_TEMPLATE_FLOW_REFERENCE_INVALID");
  if (!screen) throw new AppError(422, "Flow buttons require a navigation screen ID", "META_TEMPLATE_FLOW_SCREEN_REQUIRED");
  return {
    type: "FLOW",
    text: buttonText(content, "flow", "Open flow"),
    ...(flowId ? { flow_id: flowId } : { flow_name: flowName }),
    navigate_screen: screen,
    flow_action: "navigate",
  };
}

function buildStandardButtons(content: JsonRecord): MetaComponent | undefined {
  const ids = Array.from(new Set(stringArray(content.buttons)));
  if (!ids.length) return undefined;
  const special = ids.filter((id) => ["flow", "catalog", "offer", "multi-product"].includes(id));
  if (special.length && ids.length > 1) throw new AppError(422, "Flow, catalog, and copy-code buttons must be submitted by themselves", "META_TEMPLATE_BUTTON_COMBINATION_INVALID");
  if (ids.includes("quick-reply") && ids.some((id) => ["website", "call"].includes(id))) throw new AppError(422, "Quick replies cannot be combined with call-to-action buttons", "META_TEMPLATE_BUTTON_COMBINATION_INVALID");
  const buttons: MetaComponent[] = [];
  for (const id of ids) {
    if (id === "quick-reply") {
      const replies = stringArray(content.quickReplies);
      const texts = replies.length ? replies : [buttonText(content, id, "Quick reply")];
      if (texts.length > 3) throw new AppError(422, "Meta supports up to three quick replies", "META_TEMPLATE_BUTTON_COUNT_INVALID");
      texts.forEach((text) => {
        if (text.length > 25) throw new AppError(422, "Button text must be 1 to 25 characters", "META_TEMPLATE_BUTTON_TEXT_INVALID", { buttonType: id });
        buttons.push({ type: "QUICK_REPLY", text });
      });
    } else if (id === "website") {
      const url = nonEmptyString(content.websiteUrl);
      if (!url) throw new AppError(422, "Add a website URL before submitting a website button", "META_TEMPLATE_BUTTON_URL_REQUIRED");
      validateUrl(url.replace(/\{\{\s*\d+\s*\}\}/g, "example"));
      const rawExamples = content.websiteUrlExamples ?? content.websiteUrlExample;
      const examples = Array.isArray(rawExamples) ? stringArray(rawExamples) : nonEmptyString(rawExamples) ? [nonEmptyString(rawExamples)!] : [];
      const variables = validateVariables(url, examples, "url");
      buttons.push({ type: "URL", text: buttonText(content, id, "Visit Website"), url, ...(variables.length ? { example: examples } : {}) });
    } else if (id === "call") {
      buttons.push({ type: "PHONE_NUMBER", text: buttonText(content, id, "Call"), phone_number: phoneNumber(content.phoneNumber) });
    } else if (id === "flow") {
      buttons.push(buildFlowButton(content));
    } else if (id === "catalog") {
      buttons.push({ type: "CATALOG", text: buttonText(content, id, "View catalog") });
    } else if (id === "offer") {
      const example = nonEmptyString(content.offerCodeExample);
      if (!example) throw new AppError(422, "Copy-code buttons require an example coupon code", "META_TEMPLATE_OFFER_CODE_REQUIRED");
      buttons.push({ type: "COPY_CODE", example });
    } else {
      throw new AppError(422, "This button type is not supported by Meta", "META_TEMPLATE_BUTTON_UNSUPPORTED", { buttonType: id });
    }
  }
  return buttons.length ? { type: "BUTTONS", buttons } : undefined;
}

export function buildAuthenticationTemplate(input: TemplateInput): MetaComponent[] {
  const content = contentOf(input);
  const otpType = content.otpType === "ONE_TAP" ? "ONE_TAP" : content.otpType === "COPY_CODE" || content.otpType === undefined ? "COPY_CODE" : undefined;
  if (!otpType) throw new AppError(422, "Authentication templates support COPY_CODE or ONE_TAP", "META_TEMPLATE_OTP_TYPE_INVALID");
  const expiration = typeof content.codeExpirationMinutes === "number" ? content.codeExpirationMinutes : Number(content.codeExpirationMinutes ?? 10);
  if (!Number.isInteger(expiration) || expiration < 1 || expiration > 90) throw new AppError(422, "Code expiration must be a whole number from 1 to 90 minutes", "META_TEMPLATE_OTP_EXPIRATION_INVALID");
  const otp: JsonRecord = { type: "OTP", otp_type: otpType, text: "Copy Code" };
  if (otpType === "ONE_TAP") {
    const packageName = nonEmptyString(content.packageName);
    const signatureHash = nonEmptyString(content.signatureHash);
    const autofillText = nonEmptyString(content.autofillText) ?? "Autofill";
    if (!packageName || !signatureHash) throw new AppError(422, "ONE_TAP authentication requires package name and signature hash", "META_TEMPLATE_ONE_TAP_FIELDS_REQUIRED");
    otp.autofill_text = autofillText;
    otp.package_name = packageName;
    otp.signature_hash = signatureHash;
  }
  return [
    { type: "BODY", add_security_recommendation: content.addSecurityRecommendation !== false },
    { type: "FOOTER", code_expiration_minutes: expiration },
    { type: "BUTTONS", buttons: [otp] },
  ];
}

export function buildMultiProductTemplate(input: TemplateInput): MetaComponent[] {
  const content = contentOf(input);
  const header = buildHeaderComponent(input, content);
  const body = buildBodyComponent(input, content);
  return [
    ...(header ? [header] : []),
    body,
    { type: "BUTTONS", buttons: [{ type: "MPM", text: buttonText(content, "multi-product", "View items") }] },
  ];
}

export function buildLimitedTimeOfferTemplate(_input: TemplateInput): MetaComponent[] {
  throw new AppError(422, "Limited Time Offer template creation is disabled because the configured Meta Graph API collection does not expose a current official creation schema", "META_TEMPLATE_TYPE_UNSUPPORTED");
}

export function buildCarouselTemplate(_input: TemplateInput): MetaComponent[] {
  throw new AppError(422, "Carousel template creation is disabled until Meta's current official message-template schema is configured", "META_TEMPLATE_TYPE_UNSUPPORTED");
}

export function buildMetaTemplatePayload(input: TemplateInput) {
  if (!input.name || !input.language || !input.category) throw new AppError(422, "Template name, category, and language are required", "META_TEMPLATE_FIELDS_REQUIRED");
  const category = metaCategory(input.category);
  const templateType = input.templateType ?? "standard";
  let components: MetaComponent[];
  if (category === "AUTHENTICATION") components = buildAuthenticationTemplate(input);
  else if (templateType === "multi-product") components = buildMultiProductTemplate(input);
  else if (templateType === "carousel") components = buildCarouselTemplate(input);
  else if (templateType === "limited") components = buildLimitedTimeOfferTemplate(input);
  else {
    const content = contentOf(input);
    const header = buildHeaderComponent(input, content);
    const body = buildBodyComponent(input, content);
    const footer = nonEmptyString(input.footer);
    if (footer && /\{\{/.test(footer)) throw new AppError(422, "Footer text must be static and cannot contain body variables", "META_TEMPLATE_FOOTER_VARIABLES_INVALID");
    const buttons = buildStandardButtons(content);
    components = [...(header ? [header] : []), body, ...(footer ? [{ type: "FOOTER", text: footer }] : []), ...(buttons ? [buttons] : [])];
  }
  return { name: normalizeMetaTemplateName(input.name), language: languageCode(input.language), category, components };
}

/** Meta's template-id edit endpoint updates category/components; the submitted name is immutable. */
export function buildMetaTemplateUpdatePayload(input: TemplateInput) {
  const payload = buildMetaTemplatePayload(input);
  return { category: payload.category, components: payload.components };
}
