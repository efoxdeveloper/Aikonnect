import { z } from "zod";
import {
  automationActionSchema,
  automationConditionSchema,
  automationOperators,
  automationTriggerSchema,
  automationStatuses,
} from "../automations/automation.schemas.js";

export const workflowStatuses = automationStatuses;
export const workflowBranchSchema = z.string().trim().min(1).max(80);
const workflowPositionSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});
const workflowActionStepSchema = automationActionSchema.extend({
  branch: workflowBranchSchema.default("MAIN"),
  position: workflowPositionSchema.optional(),
});
const workflowQuestionStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal("ASK_QUESTION"),
  order: z.number().int().min(1).max(100),
  branch: workflowBranchSchema.default("MAIN"),
  position: workflowPositionSchema.optional(),
  config: z
    .object({
      mode: z.enum(["BUTTONS", "LIST", "TEXT"]).default("BUTTONS"),
      question: z.string().trim().min(1).max(1024),
      options: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
      variable: z.string().trim().min(1).max(80).default("answer"),
    })
    .superRefine((config, context) => {
      if (config.mode !== "TEXT" && config.options.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message:
            "Button and list questions require at least two answer options",
        });
      }
    }),
});
const workflowConditionStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal("SET_CONDITION"),
  order: z.number().int().min(1).max(100),
  branch: workflowBranchSchema.default("MAIN"),
  position: workflowPositionSchema.optional(),
  config: z.object({
    field: z.string().trim().min(1).max(160),
    operator: z.enum(automationOperators),
    value: z.unknown().optional(),
    trueLabel: z.string().trim().min(1).max(40).default("True"),
    falseLabel: z.string().trim().min(1).max(40).default("False"),
  }),
});
export const workflowStepSchema = z.union([
  workflowActionStepSchema.refine(
    (step) => step.type !== "START_WORKFLOW",
    "A workflow cannot start another workflow",
  ),
  workflowQuestionStepSchema,
  workflowConditionStepSchema,
]);
export const workflowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(100),
  source: z.string().trim().min(1).max(80),
  target: z.string().trim().min(1).max(80),
  condition: z.string().trim().min(1).max(80).default("NEXT"),
});
export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).max(50).default([]),
  steps: z.array(workflowStepSchema).max(100),
  edges: z.array(workflowEdgeSchema).max(150).default([]),
});

function optionCondition(label: string, index: number) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "yes") return "YES";
  if (normalized === "no") return "NO";
  return `OPTION_${index}`;
}

export function workflowOutputConditions(
  step: CreateWorkflowInput["steps"][number],
) {
  if (step.type === "ASK_QUESTION") {
    return step.config.mode === "TEXT"
      ? ["NEXT"]
      : step.config.options.map(optionCondition);
  }
  if (step.type === "SET_CONDITION") return ["TRUE", "FALSE"];
  return ["NEXT"];
}

export function workflowGraphError(
  input: Pick<CreateWorkflowInput, "steps" | "edges">,
) {
  if (!input.steps.length)
    return "Add at least one chatbot node before publishing";
  const nodeIds = new Set<string>();
  for (const step of input.steps) {
    if (nodeIds.has(step.id)) return "Workflow node IDs must be unique";
    nodeIds.add(step.id);
  }
  const edgeIds = new Set<string>();
  const outputs = new Set<string>();
  const incoming = new Set<string>();
  for (const edge of input.edges) {
    if (edgeIds.has(edge.id)) return "Workflow edge IDs must be unique";
    edgeIds.add(edge.id);
    if (edge.source !== "trigger" && !nodeIds.has(edge.source))
      return "A workflow edge has an unknown source node";
    if (!nodeIds.has(edge.target))
      return "A workflow edge has an unknown target node";
    if (edge.source === edge.target)
      return "A workflow node cannot connect to itself";
    const output = `${edge.source}:${edge.condition}`;
    if (outputs.has(output))
      return "Each node output can connect to only one next node";
    outputs.add(output);
    if (incoming.has(edge.target))
      return "Each workflow node can have only one incoming connection";
    incoming.add(edge.target);
    if (edge.source !== "trigger") {
      const source = input.steps.find((step) => step.id === edge.source);
      if (source && !workflowOutputConditions(source).includes(edge.condition))
        return "A workflow edge uses an invalid branch";
    } else if (edge.condition !== "NEXT")
      return "The trigger connection must use the NEXT branch";
  }
  const root = input.edges.find((edge) => edge.source === "trigger");
  if (!root) return "Connect the starting step to a chatbot node";
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return false;
    if (visited.has(nodeId)) return true;
    visiting.add(nodeId);
    for (const edge of input.edges.filter(
      (candidate) => candidate.source === nodeId,
    )) {
      if (!visit(edge.target)) return false;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return true;
  };
  if (!visit(root.target)) return "Workflow connections cannot contain a cycle";
  if (visited.size !== input.steps.length)
    return "Connect every chatbot node to the starting flow";
  return null;
}
export const workflowIdParamsSchema = z.object({
  workspaceId: z.uuid(),
  workflowId: z.uuid(),
});
export const workflowWorkspaceParamsSchema = z.object({
  workspaceId: z.uuid(),
});
export const workflowListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.enum(workflowStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>;
