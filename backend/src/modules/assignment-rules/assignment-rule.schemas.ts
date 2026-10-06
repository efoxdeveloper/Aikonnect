import { z } from "zod";

export const assignmentRuleWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const assignmentRuleParamsSchema = assignmentRuleWorkspaceParamsSchema.extend({ ruleId: z.uuid() });

export const assignmentRuleInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  enabled: z.boolean().default(true),
  contactTagId: z.uuid().nullable().default(null),
  phoneNumberId: z.uuid().nullable().default(null),
  strategy: z.enum(["AGENT", "ROUND_ROBIN"]),
  memberIds: z.array(z.uuid()).min(1).max(100),
}).superRefine((value, context) => {
  if (new Set(value.memberIds).size !== value.memberIds.length) {
    context.addIssue({ code: "custom", path: ["memberIds"], message: "Choose each agent only once." });
  }
  if (value.strategy === "AGENT" && value.memberIds.length !== 1) {
    context.addIssue({ code: "custom", path: ["memberIds"], message: "Choose exactly one agent for direct assignment." });
  }
});

export const reorderAssignmentRulesSchema = z.object({ ruleIds: z.array(z.uuid()).max(500) });

export type AssignmentRuleInput = z.infer<typeof assignmentRuleInputSchema>;
