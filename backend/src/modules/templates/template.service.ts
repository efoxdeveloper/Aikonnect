import type { Prisma } from "../../generated/prisma/client.js";
import { TemplateStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { toSlug } from "../../utils/slug.js";
import { connectedWhatsAppWabaId, createWhatsAppTemplate, deleteWhatsAppTemplate, listWhatsAppTemplates, updateWhatsAppTemplate } from "../whatsapp/whatsapp.service.js";
import type { CreateTemplateInput, ListTemplatesQuery, UpdateTemplateInput } from "./template.schemas.js";

const templateInclude = {
  createdBy: { select: { firstName: true, lastName: true } },
  updatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TemplateInclude;

type TemplateRecord = Prisma.TemplateGetPayload<{ include: typeof templateInclude }>;

function creatorName(user: TemplateRecord["createdBy"]): string {
  return user ? `${user.firstName} ${user.lastName}`.trim() : "Interakt Admin";
}

function serializeTemplate(template: TemplateRecord) {
  return {
    id: template.id,
    metaTemplateId: template.metaTemplateId,
    metaTemplateName: template.metaTemplateName,
    metaWabaId: template.metaWabaId,
    metaLanguageCode: template.metaLanguageCode,
    metaStatus: template.metaStatus,
    metaRejectionReason: template.metaRejectionReason,
    name: template.name,
    key: template.templateKey,
    status: template.status,
    category: template.category,
    language: template.language,
    templateType: template.templateType,
    headerType: template.headerType,
    headerText: template.headerText,
    headerFileName: template.headerFileName,
    body: template.body,
    footer: template.footer,
    content: template.content,
    createdBy: creatorName(template.createdBy),
    updatedBy: creatorName(template.updatedBy),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    deletedAt: template.deletedAt,
  };
}

type MetaTemplateComponent = { type?: unknown; format?: unknown; text?: unknown; buttons?: unknown; example?: unknown };
type MetaTemplate = { id?: string; name?: string; status?: string; category?: string; language?: string; components?: unknown };

function languageCode(value: string) {
  const aliases: Record<string, string> = { English: "en_US", Hindi: "hi", "English (US)": "en_US", "English (UK)": "en_GB" };
  return aliases[value] ?? value.replace(/-/g, "_");
}

function metaTemplateName(value: string) {
  return (toSlug(value).replace(/-/g, "_") || "template").slice(0, 512);
}

function metaTemplateStatus(value: string | undefined): TemplateStatus {
  if (value === "APPROVED") return TemplateStatus.APPROVED;
  if (value === "REJECTED") return TemplateStatus.REJECTED;
  return TemplateStatus.PENDING;
}

function componentList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is MetaTemplateComponent => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function metaComponents(input: CreateTemplateInput | UpdateTemplateInput) {
  if (input.templateType && input.templateType !== "standard") {
    throw new AppError(422, "Only standard WhatsApp templates can be submitted to Meta from this editor", "META_TEMPLATE_TYPE_UNSUPPORTED");
  }
  const components: Array<Record<string, unknown>> = [];
  const headerType = input.headerType ?? "none";
  if (headerType === "text") {
    if (!input.headerText?.trim()) throw new AppError(422, "A text header must contain header text", "META_TEMPLATE_HEADER_REQUIRED");
    components.push({ type: "HEADER", format: "TEXT", text: input.headerText.trim() });
  } else if (headerType !== "none") {
    throw new AppError(422, "Media template headers require a Meta-uploaded header example", "META_TEMPLATE_MEDIA_HEADER_UNSUPPORTED");
  }
  if (!input.body?.trim()) throw new AppError(422, "Template body is required", "META_TEMPLATE_BODY_REQUIRED");
  const bodyVariables = [...input.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
  const highestBodyVariable = Math.max(0, ...bodyVariables);
  const expectedBodyVariables = Array.from({ length: highestBodyVariable }, (_, index) => index + 1);
  if (bodyVariables.some((value, index) => bodyVariables.indexOf(value) !== index) || bodyVariables.some((value, index) => value !== expectedBodyVariables[index])) {
    throw new AppError(422, "Template variables must be numbered sequentially starting at {{1}}", "META_TEMPLATE_VARIABLES_INVALID");
  }
  components.push({ type: "BODY", text: input.body.trim(), ...(bodyVariables.length ? { example: { body_text: [Array.from({ length: Math.max(...bodyVariables) }, () => "Example")] } } : {}) });
  if (input.footer?.trim()) components.push({ type: "FOOTER", text: input.footer.trim() });

  const content = input.content && typeof input.content === "object" && !Array.isArray(input.content) ? input.content as Record<string, unknown> : {};
  const buttonIds = Array.isArray(content.buttons) ? content.buttons.filter((item): item is string => typeof item === "string") : [];
  const buttons: Array<Record<string, unknown>> = [];
  for (const buttonId of buttonIds) {
    if (buttonId === "quick-reply") buttons.push({ type: "QUICK_REPLY", text: "Quick reply" });
    else if (buttonId === "website") {
      const url = typeof content.websiteUrl === "string" ? content.websiteUrl.trim() : "";
      if (!url) throw new AppError(422, "Add a website URL before submitting a website button to Meta", "META_TEMPLATE_BUTTON_URL_REQUIRED");
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported URL protocol");
      } catch {
        throw new AppError(422, "Website buttons require a valid http(s) URL", "META_TEMPLATE_BUTTON_URL_INVALID");
      }
      buttons.push({ type: "URL", text: "Visit Website", url });
    } else {
      throw new AppError(422, "This button type is not supported by the Meta template editor yet", "META_TEMPLATE_BUTTON_UNSUPPORTED", { buttonType: buttonId });
    }
  }
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  return components;
}

function metaTemplatePayload(input: CreateTemplateInput | UpdateTemplateInput) {
  if (!input.name || !input.language || !input.category) throw new AppError(422, "Template name, category, and language are required for Meta", "META_TEMPLATE_FIELDS_REQUIRED");
  return { name: metaTemplateName(input.name), language: languageCode(input.language), category: input.category.toUpperCase(), components: metaComponents(input) };
}

function localTemplateFromMeta(template: MetaTemplate) {
  const components = componentList(template.components);
  const header = components.find((item) => item.type === "HEADER");
  const body = components.find((item) => item.type === "BODY");
  const footer = components.find((item) => item.type === "FOOTER");
  const buttonsComponent = components.find((item) => item.type === "BUTTONS");
  const buttons = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons.map((item) => {
    const button = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return button.type === "QUICK_REPLY" ? "quick-reply" : button.type === "URL" ? "website" : String(button.type ?? "button").toLowerCase();
  }) : [];
  const websiteButton = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "URL") as Record<string, unknown> | undefined : undefined;
  const format = typeof header?.format === "string" ? header.format : "NONE";
  const headerType = format === "TEXT" ? "text" : format === "IMAGE" ? "image" : format === "VIDEO" ? "video" : format === "DOCUMENT" ? "doc" : "none";
  return {
    name: template.name ?? "Meta template",
    templateKey: toSlug(template.name ?? "meta-template"),
    category: template.category === "UTILITY" ? "Utility" : template.category === "AUTHENTICATION" ? "Authentication" : "Marketing",
    language: template.language ?? "en_US",
    templateType: "standard",
    headerType,
    headerText: typeof header?.text === "string" ? header.text : null,
    headerFileName: null,
    body: typeof body?.text === "string" ? body.text : "",
    footer: typeof footer?.text === "string" ? footer.text : null,
    content: { metaComponents: template.components ?? [], buttons, ...(typeof websiteButton?.url === "string" ? { websiteUrl: websiteButton.url } : {}) },
  };
}

async function uniqueTemplateKey(workspaceId: string, name: string, excludeId?: string) {
  const base = toSlug(name) || "template";
  let candidate = base;
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const existing = await prisma.template.findFirst({
      where: { workspaceId, templateKey: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base.slice(0, 140)}-${attempt}`;
  }
  throw new AppError(409, "Unable to generate a unique template key", "TEMPLATE_KEY_EXISTS");
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function listTemplates(workspaceId: string, query: ListTemplatesQuery) {
  const statusWhere: Prisma.TemplateWhereInput = query.status === "deleted"
    ? { status: TemplateStatus.DELETED }
    : query.status === "active"
      ? { status: { not: TemplateStatus.DELETED } }
      : {};
  const where: Prisma.TemplateWhereInput = {
    workspaceId,
    ...statusWhere,
    ...(query.search ? {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { templateKey: { contains: query.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.template.count({ where }),
    prisma.template.findMany({
      where,
      include: templateInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: items.map(serializeTemplate),
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export async function getTemplate(workspaceId: string, templateId: string) {
  const template = await prisma.template.findFirst({ where: { id: templateId, workspaceId }, include: templateInclude });
  if (!template) throw new AppError(404, "Template was not found", "TEMPLATE_NOT_FOUND");
  return serializeTemplate(template);
}

export async function syncTemplatesFromMeta(workspaceId: string, actorUserId: string) {
  const result = await listWhatsAppTemplates(workspaceId);
  let imported = 0;
  const categories: Record<string, number> = {};
  for (const remote of result.templates) {
    if (!remote.id || !remote.name) continue;
    const mapped = localTemplateFromMeta(remote);
    categories[mapped.category] = (categories[mapped.category] ?? 0) + 1;
    const existing = await prisma.template.findFirst({
      where: { workspaceId, OR: [{ metaTemplateId: remote.id }, { metaWabaId: result.wabaId, metaTemplateName: remote.name, metaLanguageCode: remote.language ?? mapped.language }] },
      select: { id: true },
    });
    const data = {
      metaTemplateId: remote.id,
      metaTemplateName: remote.name,
      metaWabaId: result.wabaId,
      metaLanguageCode: remote.language ?? mapped.language,
      metaStatus: remote.status ?? "PENDING",
      metaRejectionReason: null,
      name: mapped.name,
      category: mapped.category,
      language: mapped.language,
      templateType: mapped.templateType,
      headerType: mapped.headerType,
      headerText: mapped.headerText,
      headerFileName: mapped.headerFileName,
      body: mapped.body,
      footer: mapped.footer,
      content: mapped.content as Prisma.InputJsonValue,
      status: metaTemplateStatus(remote.status),
      deletedAt: null,
      updatedById: actorUserId,
    };
    if (existing) await prisma.template.update({ where: { id: existing.id }, data });
    else await prisma.template.create({ data: { ...data, workspaceId, templateKey: await uniqueTemplateKey(workspaceId, mapped.name) }, include: templateInclude });
    imported += 1;
  }
  return { imported, wabaId: result.wabaId, debug: { ...result.debug, importedCount: imported, categories } };
}

export async function createTemplate(workspaceId: string, actorUserId: string, input: CreateTemplateInput) {
  const templateKey = await uniqueTemplateKey(workspaceId, input.name);
  const submitted = input.saveAs === "submit";
  const remote = submitted ? await createWhatsAppTemplate(workspaceId, metaTemplatePayload(input)) : null;
  if (submitted && !remote?.id) throw new AppError(502, "Meta accepted the template but did not return a template ID", "META_TEMPLATE_RESPONSE_INVALID");
  try {
    const template = await prisma.template.create({
      data: {
        workspaceId,
        status: submitted ? metaTemplateStatus(remote?.status) : TemplateStatus.DRAFT,
        metaTemplateId: remote?.id ?? null,
        metaTemplateName: submitted ? metaTemplateName(input.name) : null,
        metaWabaId: submitted ? await connectedWhatsAppWabaId(workspaceId) : null,
        metaLanguageCode: submitted ? languageCode(input.language) : null,
        metaStatus: submitted ? (remote?.status ?? "PENDING") : null,
        templateKey,
        name: input.name,
        category: input.category,
        language: input.language,
        templateType: input.templateType,
        headerType: input.headerType,
        headerText: input.headerText || null,
        headerFileName: input.headerFileName || null,
        body: input.body,
        footer: input.footer || null,
        content: input.content as Prisma.InputJsonValue,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
      include: templateInclude,
    });
    return serializeTemplate(template);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError(409, "A template with this name already exists", "TEMPLATE_NAME_EXISTS");
    throw error;
  }
}

export async function updateTemplate(workspaceId: string, templateId: string, actorUserId: string, input: UpdateTemplateInput) {
  const existing = await prisma.template.findFirst({ where: { id: templateId, workspaceId, status: { not: TemplateStatus.DELETED } }, select: { id: true, metaTemplateId: true, metaTemplateName: true, metaWabaId: true, metaLanguageCode: true, metaStatus: true, name: true, category: true, language: true, templateType: true, headerType: true, headerText: true, headerFileName: true, body: true, footer: true, content: true } });
  if (!existing) throw new AppError(404, "Template was not found", "TEMPLATE_NOT_FOUND");
  if (existing.metaTemplateId && input.name && metaTemplateName(input.name) !== existing.metaTemplateName) {
    throw new AppError(422, "Meta template names cannot be changed after submission", "META_TEMPLATE_NAME_IMMUTABLE");
  }
  if (existing.metaTemplateId && input.saveAs !== "submit") {
    throw new AppError(422, "Meta templates must be submitted through Meta after editing", "META_TEMPLATE_REQUIRES_SUBMISSION");
  }
  const merged = {
    name: input.name ?? existing.name,
    category: input.category ?? existing.category,
    language: input.language ?? existing.language,
    templateType: input.templateType ?? existing.templateType,
    headerType: input.headerType ?? existing.headerType,
    headerText: input.headerText === undefined ? existing.headerText : input.headerText,
    headerFileName: input.headerFileName === undefined ? existing.headerFileName : input.headerFileName,
    body: input.body ?? existing.body,
    footer: input.footer === undefined ? existing.footer : input.footer,
    content: input.content ?? (existing.content as Record<string, unknown>),
  } as CreateTemplateInput;
  const remote = existing.metaTemplateId ? await updateWhatsAppTemplate(workspaceId, existing.metaTemplateId, metaTemplatePayload(merged)) : null;
  try {
    const template = await prisma.template.update({
      where: { id: templateId },
      data: {
        ...(input.name !== undefined ? { name: input.name, templateKey: await uniqueTemplateKey(workspaceId, input.name, templateId) } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.templateType !== undefined ? { templateType: input.templateType } : {}),
        ...(input.headerType !== undefined ? { headerType: input.headerType } : {}),
        ...(input.headerText !== undefined ? { headerText: input.headerText || null } : {}),
        ...(input.headerFileName !== undefined ? { headerFileName: input.headerFileName || null } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.footer !== undefined ? { footer: input.footer || null } : {}),
        ...(input.content !== undefined ? { content: input.content as Prisma.InputJsonValue } : {}),
        ...(input.saveAs !== undefined ? { status: existing.metaTemplateId ? metaTemplateStatus(remote?.status ?? existing.metaStatus ?? "PENDING") : input.saveAs === "submit" ? TemplateStatus.PENDING : TemplateStatus.DRAFT } : {}),
        ...(existing.metaTemplateId ? { metaStatus: remote?.status ?? existing.metaStatus ?? "PENDING" } : {}),
        updatedById: actorUserId,
      },
      include: templateInclude,
    });
    return serializeTemplate(template);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError(409, "A template with this name already exists", "TEMPLATE_NAME_EXISTS");
    throw error;
  }
}

export async function deleteTemplate(workspaceId: string, templateId: string, actorUserId: string) {
  const existing = await prisma.template.findFirst({ where: { id: templateId, workspaceId, status: { not: TemplateStatus.DELETED } }, select: { id: true, metaTemplateId: true, metaTemplateName: true, name: true } });
  if (!existing) throw new AppError(404, "Template was not found", "TEMPLATE_NOT_FOUND");
  if (existing.metaTemplateId) await deleteWhatsAppTemplate(workspaceId, existing.metaTemplateId, existing.metaTemplateName ?? metaTemplateName(existing.name));
  const result = await prisma.template.updateMany({
    where: { id: templateId, workspaceId, status: { not: TemplateStatus.DELETED } },
    data: { status: TemplateStatus.DELETED, deletedAt: new Date(), deletedById: actorUserId, updatedById: actorUserId },
  });
  if (result.count !== 1) throw new AppError(404, "Template was not found", "TEMPLATE_NOT_FOUND");
}

export async function restoreTemplate(workspaceId: string, templateId: string, actorUserId: string) {
  const result = await prisma.template.updateMany({
    where: { id: templateId, workspaceId, status: TemplateStatus.DELETED },
    data: { status: TemplateStatus.DRAFT, deletedAt: null, deletedById: null, updatedById: actorUserId, metaTemplateId: null, metaTemplateName: null, metaWabaId: null, metaLanguageCode: null, metaStatus: null, metaRejectionReason: null },
  });
  if (result.count !== 1) throw new AppError(404, "Deleted template was not found", "TEMPLATE_NOT_FOUND");
  return getTemplate(workspaceId, templateId);
}
