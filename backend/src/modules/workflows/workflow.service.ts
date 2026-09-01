import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  createWorkflowSchema,
  workflowGraphError,
  type CreateWorkflowInput,
  type WorkflowListQuery,
} from "./workflow.schemas.js";

const workflowSelect = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  status: true,
  trigger: true,
  conditions: true,
  steps: true,
  edges: true,
  runCount: true,
  enrolledCount: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.WorkflowSelect;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function requireWorkflow(workspaceId: string, workflowId: string) {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId },
    select: workflowSelect,
  });
  if (!workflow)
    throw new AppError(404, "Workflow was not found", "WORKFLOW_NOT_FOUND");
  return workflow;
}

function whereFor(
  workspaceId: string,
  query: WorkflowListQuery,
): Prisma.WorkflowWhereInput {
  return {
    workspaceId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { name: { contains: query.search, mode: "insensitive" } }
      : {}),
  };
}

export async function listWorkflows(
  workspaceId: string,
  query: WorkflowListQuery,
) {
  const where = whereFor(workspaceId, query);
  const [total, items] = await prisma.$transaction([
    prisma.workflow.count({ where }),
    prisma.workflow.findMany({
      where,
      select: workflowSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      hasNext: query.page * query.pageSize < total,
      hasPrevious: query.page > 1,
    },
  };
}

export async function getWorkflow(workspaceId: string, workflowId: string) {
  return requireWorkflow(workspaceId, workflowId);
}

export async function createWorkflow(
  workspaceId: string,
  userId: string,
  input: CreateWorkflowInput,
) {
  return prisma.workflow.create({
    data: {
      workspaceId,
      createdById: userId,
      name: input.name,
      description: input.description || null,
      trigger: asJson(input.trigger),
      conditions: asJson(input.conditions),
      steps: asJson(input.steps),
      edges: asJson(input.edges),
    },
    select: workflowSelect,
  });
}

export async function updateWorkflow(
  workspaceId: string,
  workflowId: string,
  input: CreateWorkflowInput,
) {
  await requireWorkflow(workspaceId, workflowId);
  return prisma.workflow.update({
    where: { id: workflowId },
    data: {
      name: input.name,
      description: input.description || null,
      trigger: asJson(input.trigger),
      conditions: asJson(input.conditions),
      steps: asJson(input.steps),
      edges: asJson(input.edges),
    },
    select: workflowSelect,
  });
}

export async function deleteWorkflow(workspaceId: string, workflowId: string) {
  await requireWorkflow(workspaceId, workflowId);
  await prisma.workflow.delete({ where: { id: workflowId } });
}

export async function setWorkflowStatus(
  workspaceId: string,
  workflowId: string,
  status: "ACTIVE" | "PAUSED",
) {
  const workflow = await requireWorkflow(workspaceId, workflowId);
  if (status === "ACTIVE") {
    const parsed = createWorkflowSchema.safeParse({
      name: workflow.name,
      description: workflow.description,
      trigger: workflow.trigger,
      conditions: workflow.conditions,
      steps: workflow.steps,
      edges: workflow.edges,
    });
    if (!parsed.success)
      throw new AppError(
        422,
        parsed.error.issues[0]?.message ??
          "Complete the workflow before publishing it",
        "WORKFLOW_INVALID",
      );
    const graphError = workflowGraphError(parsed.data);
    if (graphError) throw new AppError(422, graphError, "WORKFLOW_INVALID");
  }
  return prisma.workflow.update({
    where: { id: workflow.id },
    data: { status },
    select: workflowSelect,
  });
}
