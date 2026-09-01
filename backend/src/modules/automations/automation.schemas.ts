import { z } from "zod";

export const automationStatuses = ["DRAFT", "ACTIVE", "PAUSED"] as const;
export const automationTriggerTypes = [
  "MESSAGE_RECEIVED", "MESSAGE_SENT", "CUSTOMER_REPLIED", "TEMPLATE_DELIVERED", "TEMPLATE_READ", "TEMPLATE_FAILED",
  "CONTACT_CREATED", "CONTACT_UPDATED", "TAG_ADDED", "TAG_REMOVED", "CUSTOM_FIELD_UPDATED",
  "CONVERSATION_OPENED", "CONVERSATION_CLOSED", "CONVERSATION_ASSIGNED", "CONVERSATION_UNASSIGNED",
  "CAMPAIGN_MESSAGE_SENT", "CAMPAIGN_REPLIED", "CAMPAIGN_CTA_CLICKED", "WEBHOOK_RECEIVED", "CUSTOM_EVENT_RECEIVED",
] as const;
export const automationActionTypes = [
  "SEND_MESSAGE", "SEND_TEMPLATE", "SEND_MEDIA", "ADD_TAG", "REMOVE_TAG", "UPDATE_CONTACT_FIELD", "UPDATE_CUSTOM_FIELD",
  "ASSIGN_AGENT", "ASSIGN_TEAM", "CLOSE_CONVERSATION", "REOPEN_CONVERSATION", "CHANGE_CONVERSATION_STATUS",
  "START_WORKFLOW", "START_SEQUENCE", "STOP_SEQUENCE", "SEND_WEBHOOK", "CALL_API", "WAIT", "ADD_INTERNAL_NOTE",
] as const;
export const automationOperators = [
  "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty",
  "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal", "is", "is_not", "is_any_of", "is_none_of",
] as const;

const jsonValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())]);
const config = z.record(z.string(), jsonValue).default({});

export const automationTriggerSchema = z.object({
  type: z.enum(automationTriggerTypes),
  config,
});

export const automationConditionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  field: z.string().trim().min(1).max(120),
  operator: z.enum(automationOperators),
  value: jsonValue.optional(),
  connector: z.enum(["AND", "OR"]).default("AND"),
});

export const automationActionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(automationActionTypes),
  order: z.number().int().min(1).max(100),
  config,
});

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).max(50).default([]),
  actions: z.array(automationActionSchema).max(100),
});

export const updateAutomationSchema = createAutomationSchema;
export const automationIdParamsSchema = z.object({ workspaceId: z.uuid(), automationId: z.uuid() });
export const automationWorkspaceParamsSchema = z.object({ workspaceId: z.uuid() });
export const automationListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.enum(automationStatuses).optional(),
  trigger: z.enum(automationTriggerTypes).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type AutomationListQuery = z.infer<typeof automationListQuerySchema>;
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
