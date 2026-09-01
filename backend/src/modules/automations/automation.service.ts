import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { createAutomationSchema, type AutomationListQuery, type CreateAutomationInput } from "./automation.schemas.js";

const automationSelect = {
  id: true, workspaceId: true, name: true, description: true, status: true, trigger: true, conditions: true, actions: true,
  runCount: true, lastRunAt: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AutomationSelect;

function asJson(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function requireAutomation(workspaceId: string, automationId: string) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, workspaceId }, select: automationSelect });
  if (!automation) throw new AppError(404, "Automation was not found", "AUTOMATION_NOT_FOUND");
  return automation;
}

function whereFor(workspaceId: string, query: AutomationListQuery): Prisma.AutomationWhereInput {
  return {
    workspaceId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.trigger ? { trigger: { path: ["type"], equals: query.trigger } } : {}),
  };
}

export async function listAutomations(workspaceId: string, query: AutomationListQuery) {
  const where = whereFor(workspaceId, query);
  const [total, items] = await prisma.$transaction([
    prisma.automation.count({ where }),
    prisma.automation.findMany({ where, select: automationSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 } };
}

export async function getAutomation(workspaceId: string, automationId: string) {
  return requireAutomation(workspaceId, automationId);
}

export async function createAutomation(workspaceId: string, userId: string, input: CreateAutomationInput) {
  return prisma.automation.create({
    data: { workspaceId, createdById: userId, name: input.name, description: input.description || null, trigger: asJson(input.trigger), conditions: asJson(input.conditions), actions: asJson(input.actions) },
    select: automationSelect,
  });
}

export async function updateAutomation(workspaceId: string, automationId: string, input: CreateAutomationInput) {
  await requireAutomation(workspaceId, automationId);
  return prisma.automation.update({
    where: { id: automationId },
    data: { name: input.name, description: input.description || null, trigger: asJson(input.trigger), conditions: asJson(input.conditions), actions: asJson(input.actions) },
    select: automationSelect,
  });
}

export async function deleteAutomation(workspaceId: string, automationId: string) {
  await requireAutomation(workspaceId, automationId);
  await prisma.automation.delete({ where: { id: automationId } });
}

export async function setAutomationStatus(workspaceId: string, automationId: string, status: "ACTIVE" | "PAUSED") {
  const automation = await requireAutomation(workspaceId, automationId);
  if (status === "ACTIVE") {
    const parsed = createAutomationSchema.safeParse({ name: automation.name, description: automation.description, trigger: automation.trigger, conditions: automation.conditions, actions: automation.actions });
    if (!parsed.success) throw new AppError(422, parsed.error.issues[0]?.message ?? "Complete the automation before publishing it", "AUTOMATION_INVALID");
    if (!parsed.data.actions.length) throw new AppError(422, "Add at least one action before publishing the automation", "AUTOMATION_INVALID");
    for (const action of parsed.data.actions) {
      const config = action.config;
      const missing = action.type === "SEND_MESSAGE" || action.type === "ADD_INTERNAL_NOTE" ? !String(config.message ?? "").trim()
        : action.type === "SEND_TEMPLATE" ? !config.templateId
          : action.type === "ADD_TAG" || action.type === "REMOVE_TAG" ? !config.tagId
            : action.type === "ASSIGN_AGENT" ? !config.memberId
              : action.type === "ASSIGN_TEAM" ? !String(config.teamName ?? "").trim()
                : action.type === "WAIT" ? !Number(config.amount) || Number(config.amount) < 1
                  : ["START_WORKFLOW", "START_SEQUENCE", "STOP_SEQUENCE"].includes(action.type) && !String(config.reference ?? "").trim();
      if (missing) throw new AppError(422, `Complete the ${action.type.replaceAll("_", " ").toLowerCase()} action before publishing`, "AUTOMATION_INVALID");
    }
  }
  return prisma.automation.update({ where: { id: automation.id }, data: { status }, select: automationSelect });
}

export async function listAutomationLogs(workspaceId: string, automationId: string, page: number, pageSize: number) {
  await requireAutomation(workspaceId, automationId);
  const where = { workspaceId, automationId };
  const [total, items] = await prisma.$transaction([
    prisma.automationLog.count({ where }),
    prisma.automationLog.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, status: true, triggerPayload: true, conditionResults: true, actionResults: true, error: true, startedAt: true, completedAt: true, contact: { select: { id: true, name: true, phoneE164: true } } } }),
  ]);
  return { items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasNext: page * pageSize < total, hasPrevious: page > 1 } };
}
