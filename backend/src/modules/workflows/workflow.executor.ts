import type { Prisma } from "../../generated/prisma/client.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import {
  evaluateCondition,
  executeAction,
  loadContext,
  type EventContext,
} from "../automations/automation.executor.js";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
} from "../automations/automation.schemas.js";
import { sendAutomationText } from "../whatsapp/whatsapp.service.js";

type WorkflowQuestion = {
  id: string;
  type: "ASK_QUESTION";
  order: number;
  config: {
    mode?: "BUTTONS" | "LIST" | "TEXT";
    question: string;
    options: string[];
    variable: string;
  };
};
type WorkflowCondition = {
  id: string;
  type: "SET_CONDITION";
  order: number;
  config: {
    field: string;
    operator: AutomationCondition["operator"];
    value?: unknown;
    trueLabel: string;
    falseLabel: string;
  };
};
type WorkflowAction = AutomationAction & { branch?: string };
type WorkflowStep = WorkflowQuestion | WorkflowCondition | WorkflowAction;
type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  condition: string;
};
type WorkflowSnapshot = {
  id: string;
  trigger: unknown;
  conditions: unknown;
  steps: unknown;
  edges: unknown;
  status: string;
};
type LoadedContext = Awaited<ReturnType<typeof loadContext>>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
function normalized(value: unknown): string {
  return asString(value).trim().toLowerCase();
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function isQuestion(step: WorkflowStep): step is WorkflowQuestion {
  return step.type === "ASK_QUESTION";
}
function isCondition(step: WorkflowStep): step is WorkflowCondition {
  return step.type === "SET_CONDITION";
}
function isAction(step: WorkflowStep): step is WorkflowAction {
  return !isQuestion(step) && !isCondition(step);
}
function optionCondition(label: string, index: number) {
  const value = normalized(label);
  if (value === "yes") return "YES";
  if (value === "no") return "NO";
  return `OPTION_${index}`;
}

export function resolveQuestionAnswer(
  text: string | undefined,
  options: string[],
): "YES" | "NO" | null {
  const condition = resolveQuestionRoute(text, "BUTTONS", options);
  return condition === "YES" || condition === "NO" ? condition : null;
}

export function resolveQuestionRoute(
  text: string | undefined,
  mode: "BUTTONS" | "LIST" | "TEXT" | undefined,
  options: string[],
) {
  const answer = asString(text).trim();
  if (!answer) return null;
  if (mode === "TEXT") return "NEXT";
  const normalizedAnswer = normalized(answer);
  const selected = options.findIndex(
    (option, index) =>
      normalizedAnswer === normalized(option) || answer === String(index + 1),
  );
  return selected < 0 ? null : optionCondition(options[selected]!, selected);
}

export function nextWorkflowStep(
  edges: WorkflowEdge[],
  source: string,
  condition: string,
) {
  return edges.find(
    (edge) => edge.source === source && edge.condition === condition,
  )?.target;
}

function conditionsMatch(
  conditions: AutomationCondition[],
  context: LoadedContext,
) {
  if (!conditions.length) return true;
  const results = conditions.map((condition) =>
    evaluateCondition(condition, context),
  );
  return conditions
    .slice(1)
    .reduce(
      (matched, condition, index) =>
        condition.connector === "OR"
          ? matched || results[index + 1]
          : matched && results[index + 1],
      results[0],
    );
}

function legacyEdges(steps: WorkflowStep[]): WorkflowEdge[] {
  const ordered = [...steps].sort((left, right) => left.order - right.order);
  const decision = ordered.find(
    (step) => isQuestion(step) || isCondition(step),
  );
  if (!decision) {
    return ordered.map((step, index) => ({
      id: `legacy-${step.id}`,
      source: index ? ordered[index - 1]!.id : "trigger",
      target: step.id,
      condition: "NEXT",
    }));
  }
  const edges: WorkflowEdge[] = [
    {
      id: `legacy-trigger-${decision.id}`,
      source: "trigger",
      target: decision.id,
      condition: "NEXT",
    },
  ];
  const branches = isQuestion(decision)
    ? decision.config.mode === "TEXT"
      ? ["NEXT"]
      : decision.config.options.map(optionCondition)
    : ["TRUE", "FALSE"];
  for (const branch of branches) {
    const branchSteps = ordered.filter(
      (step) => isAction(step) && (step.branch ?? "MAIN") === branch,
    );
    branchSteps.forEach((step, index) =>
      edges.push({
        id: `legacy-${branch}-${step.id}`,
        source: index ? branchSteps[index - 1]!.id : decision.id,
        target: step.id,
        condition: index ? "NEXT" : branch,
      }),
    );
  }
  return edges;
}

function graphFor(workflow: WorkflowSnapshot) {
  const steps = asArray<WorkflowStep>(workflow.steps);
  const persistedEdges = asArray<WorkflowEdge>(workflow.edges);
  return {
    steps,
    edges: persistedEdges.length ? persistedEdges : legacyEdges(steps),
  };
}

async function askQuestion(
  workspaceId: string,
  conversationId: string,
  question: WorkflowQuestion,
) {
  if (question.config.mode === "TEXT") {
    await sendAutomationText(
      workspaceId,
      conversationId,
      question.config.question,
    );
    return;
  }
  const options = question.config.options
    .map((option, index) => `${index + 1}. ${option}`)
    .join("\n");
  await sendAutomationText(
    workspaceId,
    conversationId,
    `${question.config.question}\n\n${options}`,
  );
}

async function completeRun(
  runId: string,
  workflowId: string,
  context: Record<string, unknown>,
) {
  await prisma.$transaction([
    prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        currentStepId: null,
        context: json(context),
        completedAt: new Date(),
      },
    }),
    prisma.workflow.update({
      where: { id: workflowId },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    }),
  ]);
}

async function failRun(runId: string, context: Record<string, unknown>) {
  await prisma.workflowRun
    .update({
      where: { id: runId },
      data: {
        status: "FAILED",
        context: json(context),
        completedAt: new Date(),
      },
    })
    .catch(() => undefined);
}

async function advanceRun(
  workspaceId: string,
  runId: string,
  workflow: WorkflowSnapshot,
  startStepId: string | undefined,
  context: LoadedContext,
  variables: Record<string, unknown>,
) {
  const { steps, edges } = graphFor(workflow);
  let currentStepId = startStepId;
  const visited = new Set<string>();
  while (currentStepId) {
    if (visited.has(currentStepId) || visited.size >= 100) {
      throw new Error("Workflow graph contains a cycle or exceeds 100 steps");
    }
    visited.add(currentStepId);
    const step = steps.find((candidate) => candidate.id === currentStepId);
    if (!step)
      throw new Error(`Workflow node ${currentStepId} no longer exists`);
    if (isQuestion(step)) {
      if (!context.conversation)
        throw new Error("The workflow conversation no longer exists");
      await askQuestion(workspaceId, context.conversation.id, step);
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: "WAITING",
          currentStepId: step.id,
          context: json(variables),
        },
      });
      return;
    }
    if (isCondition(step)) {
      const matched = evaluateCondition(
        {
          id: step.id,
          field: step.config.field,
          operator: step.config.operator,
          value: step.config.value as AutomationCondition["value"],
          connector: "AND",
        },
        { ...context, variables },
      );
      variables[`${step.id}.matched`] = matched;
      currentStepId = nextWorkflowStep(
        edges,
        step.id,
        matched ? "TRUE" : "FALSE",
      );
      continue;
    }
    await executeAction(workspaceId, step, { ...context, variables });
    currentStepId = nextWorkflowStep(edges, step.id, "NEXT");
  }
  await completeRun(runId, workflow.id, variables);
}

async function resumeWaitingRun(
  workspaceId: string,
  run: {
    id: string;
    currentStepId: string | null;
    workflow: WorkflowSnapshot;
    context: Prisma.JsonValue;
  },
  event: EventContext,
) {
  const { steps, edges } = graphFor(run.workflow);
  const question = steps.find(
    (step): step is WorkflowQuestion =>
      isQuestion(step) && step.id === run.currentStepId,
  );
  if (!question) return false;
  const condition = resolveQuestionRoute(
    event.message?.text,
    question.config.mode,
    question.config.options,
  );
  if (!condition) return false;
  const variables = {
    ...asRecord(run.context),
    [question.config.variable || "answer"]: event.message?.text ?? "",
  };
  const context = await loadContext(workspaceId, event);
  await advanceRun(
    workspaceId,
    run.id,
    run.workflow,
    nextWorkflowStep(edges, question.id, condition),
    context,
    variables,
  );
  return true;
}

async function startWorkflow(
  workspaceId: string,
  workflow: WorkflowSnapshot,
  event: EventContext,
  context: LoadedContext,
) {
  if (!event.contactId || !event.conversationId) return;
  const { edges } = graphFor(workflow);
  const run = await prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      workspaceId,
      contactId: event.contactId,
      conversationId: event.conversationId,
      status: "WAITING",
      currentStepId: null,
      context: json({}),
    },
  });
  try {
    await advanceRun(
      workspaceId,
      run.id,
      workflow,
      nextWorkflowStep(edges, "trigger", "NEXT"),
      context,
      {},
    );
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { enrolledCount: { increment: 1 } },
    });
  } catch (error) {
    logger.error(
      { workflowId: workflow.id, runId: run.id, workspaceId, error },
      "Workflow enrollment failed",
    );
    await failRun(run.id, {});
  }
}

export async function runWorkflowsForEvent(
  workspaceId: string,
  triggerType: AutomationTrigger["type"],
  event: EventContext,
) {
  if (!event.contactId || !event.conversationId) return;
  const context = await loadContext(workspaceId, event);
  const waitingRuns = await prisma.workflowRun.findMany({
    where: {
      workspaceId,
      contactId: event.contactId,
      conversationId: event.conversationId,
      status: "WAITING",
      currentStepId: { not: null },
      workflow: { status: "ACTIVE" },
    },
    select: {
      id: true,
      currentStepId: true,
      context: true,
      workflow: {
        select: {
          id: true,
          trigger: true,
          conditions: true,
          steps: true,
          edges: true,
          status: true,
        },
      },
    },
  });
  let resumed = false;
  for (const run of waitingRuns) {
    resumed = (await resumeWaitingRun(workspaceId, run, event)) || resumed;
  }
  if (resumed || waitingRuns.length) return;
  const workflows = await prisma.workflow.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: {
      id: true,
      trigger: true,
      conditions: true,
      steps: true,
      edges: true,
      status: true,
    },
  });
  for (const workflow of workflows) {
    if (asRecord(workflow.trigger).type !== triggerType) continue;
    const conditions = asArray<AutomationCondition>(workflow.conditions);
    if (!conditionsMatch(conditions, context)) continue;
    await startWorkflow(workspaceId, workflow, event, context);
  }
}
