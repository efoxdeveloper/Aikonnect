import type { Prisma } from "../../generated/prisma/client.js";
import { TemplateStatus } from "../../generated/prisma/enums.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { toSlug } from "../../utils/slug.js";
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

export async function createTemplate(workspaceId: string, actorUserId: string, input: CreateTemplateInput) {
  const templateKey = await uniqueTemplateKey(workspaceId, input.name);
  try {
    const template = await prisma.template.create({
      data: {
        workspaceId,
        status: input.saveAs === "submit" ? TemplateStatus.PENDING : TemplateStatus.DRAFT,
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
  const existing = await prisma.template.findFirst({ where: { id: templateId, workspaceId, status: { not: TemplateStatus.DELETED } }, select: { id: true } });
  if (!existing) throw new AppError(404, "Template was not found", "TEMPLATE_NOT_FOUND");
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
        ...(input.saveAs !== undefined ? { status: input.saveAs === "submit" ? TemplateStatus.PENDING : TemplateStatus.DRAFT } : {}),
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
  const result = await prisma.template.updateMany({
    where: { id: templateId, workspaceId, status: { not: TemplateStatus.DELETED } },
    data: { status: TemplateStatus.DELETED, deletedAt: new Date(), deletedById: actorUserId, updatedById: actorUserId },
  });
  if (result.count !== 1) throw new AppError(404, "Template was not found", "TEMPLATE_NOT_FOUND");
}

export async function restoreTemplate(workspaceId: string, templateId: string, actorUserId: string) {
  const result = await prisma.template.updateMany({
    where: { id: templateId, workspaceId, status: TemplateStatus.DELETED },
    data: { status: TemplateStatus.DRAFT, deletedAt: null, deletedById: null, updatedById: actorUserId },
  });
  if (result.count !== 1) throw new AppError(404, "Deleted template was not found", "TEMPLATE_NOT_FOUND");
  return getTemplate(workspaceId, templateId);
}
