import type { Prisma } from "../../generated/prisma/client.js";
import { TemplateStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { toSlug } from "../../utils/slug.js";
import { addWhatsAppTemplateFromLibrary, assertWhatsAppCatalogReady, connectedWhatsAppWabaId, createWhatsAppTemplate, deleteWhatsAppTemplate, listWhatsAppTemplateLibrary, listWhatsAppTemplates, updateWhatsAppTemplate } from "../whatsapp/whatsapp.service.js";
import { reviewTemplateWithAI, type TemplateAIReview } from "./template-ai.service.js";
import type { AddLibraryTemplateInput, CreateTemplateInput, ListTemplatesQuery, TemplateLibraryQuery, UpdateTemplateInput } from "./template.schemas.js";
import { buildMetaTemplatePayload, buildMetaTemplateUpdatePayload, languageCode, metaTemplateName } from "./meta-template-payload.js";

const templateInclude = {
  createdBy: { select: { firstName: true, lastName: true } },
  updatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TemplateInclude;

type TemplateRecord = Prisma.TemplateGetPayload<{ include: typeof templateInclude }>;

function creatorName(user: TemplateRecord["createdBy"]): string {
  return user ? `${user.firstName} ${user.lastName}`.trim() : "Marento Admin";
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

function metaTemplateStatus(value: string | undefined): TemplateStatus {
  if (value === "APPROVED") return TemplateStatus.APPROVED;
  if (value === "REJECTED") return TemplateStatus.REJECTED;
  return TemplateStatus.PENDING;
}

function componentList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is MetaTemplateComponent => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function metaTemplatePayload(input: CreateTemplateInput | UpdateTemplateInput) {
  return buildMetaTemplatePayload(input);
}

function contentUsesCatalog(input: CreateTemplateInput | UpdateTemplateInput) {
  const content = input.content && typeof input.content === "object" && !Array.isArray(input.content) ? input.content as Record<string, unknown> : {};
  return input.templateType === "multi-product" || (Array.isArray(content.buttons) && content.buttons.includes("catalog"));
}

function aiReviewInput(input: CreateTemplateInput) {
  const content = input.content && typeof input.content === "object" && !Array.isArray(input.content) ? input.content as Record<string, unknown> : {};
  const buttons = Array.isArray(content.buttons) ? content.buttons.filter((item): item is string => typeof item === "string").slice(0, 7) : [];
  return {
    name: input.name,
    category: input.category,
    language: input.language,
    headerType: input.headerType,
    headerText: input.headerText ?? null,
    body: input.body,
    footer: input.footer ?? null,
    buttons,
    websiteUrl: typeof content.websiteUrl === "string" ? content.websiteUrl : "",
  };
}

function aiRejectionReason(review: TemplateAIReview) {
  return [`AI preflight: ${review.summary}`, ...review.issues.map((issue) => `${issue.field}: ${issue.message}${issue.suggestion ? ` ${issue.suggestion}` : ""}`)].join("\n").slice(0, 10_000);
}

function localTemplateFromMeta(template: MetaTemplate) {
  const components = componentList(template.components);
  const header = components.find((item) => item.type === "HEADER");
  const body = components.find((item) => item.type === "BODY");
  const footer = components.find((item) => item.type === "FOOTER");
  const buttonsComponent = components.find((item) => item.type === "BUTTONS");
  const buttonRecords = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}) : [];
  const buttons = buttonRecords.map((button) => {
    return button.type === "QUICK_REPLY" ? "quick-reply" : button.type === "URL" ? "website" : button.type === "PHONE_NUMBER" ? "call" : button.type === "FLOW" ? "flow" : button.type === "CATALOG" ? "catalog" : button.type === "COPY_CODE" ? "offer" : String(button.type ?? "button").toLowerCase();
  });
  const websiteButton = buttonRecords.find((button) => button.type === "URL");
  const phoneButton = buttonRecords.find((button) => button.type === "PHONE_NUMBER");
  const flowButton = buttonRecords.find((button) => button.type === "FLOW");
  const offerButton = buttonRecords.find((button) => button.type === "COPY_CODE");
  const buttonTexts = Object.fromEntries(buttonRecords.map((button, index) => {
    const buttonId = buttons[index];
    return [buttonId, typeof button.text === "string" ? button.text : undefined];
  }).filter(([, text]) => typeof text === "string"));
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
    content: { metaComponents: template.components ?? [], buttons, buttonTexts, ...(typeof websiteButton?.url === "string" ? { websiteUrl: websiteButton.url } : {}), ...(typeof phoneButton?.phone_number === "string" ? { phoneNumber: phoneButton.phone_number } : {}), ...(typeof flowButton?.flow_id === "string" ? { flowId: flowButton.flow_id } : {}), ...(typeof flowButton?.navigate_screen === "string" ? { flowNavigateScreen: flowButton.navigate_screen } : {}), ...(typeof offerButton?.example === "string" ? { offerCodeExample: offerButton.example } : {}) },
  };
}

function libraryComponentList(value: unknown) {
  return componentList(value).map((component) => ({
    type: typeof component.type === "string" ? component.type : undefined,
    format: typeof component.format === "string" ? component.format : undefined,
    text: typeof component.text === "string" ? component.text : undefined,
    buttons: Array.isArray(component.buttons) ? component.buttons : undefined,
    example: component.example,
  }));
}

function normalizeLibraryTemplate(template: Record<string, unknown>) {
  const components = libraryComponentList(template.components);
  const bodyComponent = components.find((component) => component.type === "BODY");
  const buttonsComponent = components.find((component) => component.type === "BUTTONS");
  return {
    id: typeof template.id === "string" ? template.id : null,
    name: typeof template.name === "string" ? template.name : "Meta template",
    language: typeof template.language === "string" ? template.language : "en_US",
    category: typeof template.category === "string" ? template.category : "UTILITY",
    topic: typeof template.topic === "string" ? template.topic : null,
    industry: typeof template.industry === "string" ? template.industry : null,
    usecase: typeof template.usecase === "string" ? template.usecase : null,
    body: typeof template.body === "string" ? template.body : bodyComponent?.text ?? "",
    parameters: template.parameters ?? bodyComponent?.example ?? null,
    buttons: Array.isArray(template.buttons) ? template.buttons : buttonsComponent?.buttons ?? [],
    components: template.components ?? [],
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

export async function listTemplateLibrary(workspaceId: string, query: TemplateLibraryQuery) {
  const result = await listWhatsAppTemplateLibrary(workspaceId, query);
  return {
    items: result.items.map((item) => normalizeLibraryTemplate(item as Record<string, unknown>)),
    paging: result.paging,
  };
}

export async function addTemplateFromLibrary(workspaceId: string, actorUserId: string, input: AddLibraryTemplateInput) {
  const libraryButtonInputs = input.libraryTemplateButtonInputs?.map((button) => button.type === "URL"
    ? { type: "URL", url: { base_url: button.value, url_suffix_example: button.value } }
    : { type: "PHONE_NUMBER", phone_number: button.value });
  const remote = await addWhatsAppTemplateFromLibrary(workspaceId, {
    name: metaTemplateName(input.name),
    language: languageCode(input.language),
    category: input.category,
    library_template_name: input.libraryTemplateName,
    ...(libraryButtonInputs?.length ? { library_template_button_inputs: libraryButtonInputs } : {}),
  });
  const sync = await syncTemplatesFromMeta(workspaceId, actorUserId);
  const template = remote.id
    ? await prisma.template.findFirst({ where: { workspaceId, metaTemplateId: remote.id }, include: templateInclude })
    : null;
  return { template: template ? serializeTemplate(template) : null, remote: { id: remote.id ?? null, status: remote.status ?? "PENDING" }, sync };
}

export async function createTemplate(workspaceId: string, actorUserId: string, input: CreateTemplateInput) {
  const templateKey = await uniqueTemplateKey(workspaceId, input.name);
  const submitted = input.saveAs === "submit";
  let remote: MetaTemplate | null = null;
  let aiReview: TemplateAIReview | null = null;
  if (submitted) {
    const payload = metaTemplatePayload(input);
    if (contentUsesCatalog(input)) await assertWhatsAppCatalogReady(workspaceId);
    aiReview = await reviewTemplateWithAI(aiReviewInput(input));
    if (!aiReview || aiReview.decision === "pass") remote = await createWhatsAppTemplate(workspaceId, payload);
  }
  if (submitted && aiReview?.decision !== "block" && !remote?.id) throw new AppError(502, "Meta accepted the template but did not return a template ID", "META_TEMPLATE_RESPONSE_INVALID");
  try {
    const template = await prisma.template.create({
      data: {
        workspaceId,
        status: submitted && aiReview?.decision === "block" ? TemplateStatus.REJECTED : submitted ? metaTemplateStatus(remote?.status) : TemplateStatus.DRAFT,
        metaTemplateId: submitted && aiReview?.decision !== "block" ? remote?.id ?? null : null,
        metaTemplateName: submitted && aiReview?.decision !== "block" ? metaTemplateName(input.name) : null,
        metaWabaId: submitted && aiReview?.decision !== "block" ? await connectedWhatsAppWabaId(workspaceId) : null,
        metaLanguageCode: submitted && aiReview?.decision !== "block" ? languageCode(input.language) : null,
        metaStatus: submitted && aiReview?.decision !== "block" ? (remote?.status ?? "PENDING") : null,
        metaRejectionReason: aiReview?.decision === "block" ? aiRejectionReason(aiReview) : null,
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
  const aiReview = input.saveAs === "submit" ? await reviewTemplateWithAI(aiReviewInput(merged)) : null;
  const aiRejected = aiReview?.decision === "block";
  if (input.saveAs === "submit" && contentUsesCatalog(merged)) await assertWhatsAppCatalogReady(workspaceId);
  const remote = !aiRejected && existing.metaTemplateId ? await updateWhatsAppTemplate(workspaceId, existing.metaTemplateId, buildMetaTemplateUpdatePayload(merged)) : null;
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
        ...(input.saveAs !== undefined ? { status: aiRejected ? TemplateStatus.REJECTED : existing.metaTemplateId ? metaTemplateStatus(remote?.status ?? existing.metaStatus ?? "PENDING") : input.saveAs === "submit" ? TemplateStatus.PENDING : TemplateStatus.DRAFT, metaRejectionReason: aiRejected && aiReview ? aiRejectionReason(aiReview) : null } : {}),
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
