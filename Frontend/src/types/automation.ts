export type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type AutomationRunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
export type AutomationTriggerType =
  | "MESSAGE_RECEIVED" | "MESSAGE_SENT" | "CUSTOMER_REPLIED" | "TEMPLATE_DELIVERED" | "TEMPLATE_READ" | "TEMPLATE_FAILED"
  | "CONTACT_CREATED" | "CONTACT_UPDATED" | "TAG_ADDED" | "TAG_REMOVED" | "CUSTOM_FIELD_UPDATED"
  | "CONVERSATION_OPENED" | "CONVERSATION_CLOSED" | "CONVERSATION_ASSIGNED" | "CONVERSATION_UNASSIGNED"
  | "CAMPAIGN_MESSAGE_SENT" | "CAMPAIGN_REPLIED" | "CAMPAIGN_CTA_CLICKED" | "WEBHOOK_RECEIVED" | "CUSTOM_EVENT_RECEIVED";
export type AutomationActionType =
  | "SEND_MESSAGE" | "SEND_TEMPLATE" | "SEND_MEDIA" | "ADD_TAG" | "REMOVE_TAG" | "UPDATE_CONTACT_FIELD" | "UPDATE_CUSTOM_FIELD"
  | "ASSIGN_AGENT" | "ASSIGN_TEAM" | "CLOSE_CONVERSATION" | "REOPEN_CONVERSATION" | "CHANGE_CONVERSATION_STATUS"
  | "START_WORKFLOW" | "START_SEQUENCE" | "STOP_SEQUENCE" | "SEND_WEBHOOK" | "CALL_API" | "WAIT" | "ADD_INTERNAL_NOTE";
export type AutomationOperator = "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty" | "greater_than" | "less_than" | "greater_than_or_equal" | "less_than_or_equal" | "is" | "is_not" | "is_any_of" | "is_none_of";
export type AutomationTrigger = { type: AutomationTriggerType; config: Record<string, unknown> };
export type AutomationCondition = { id: string; field: string; operator: AutomationOperator; value?: unknown; connector: "AND" | "OR" };
export type AutomationAction = { id: string; type: AutomationActionType; order: number; config: Record<string, unknown> };
export type Automation = { id: string; workspaceId: string; name: string; description: string | null; status: AutomationStatus; trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[]; runCount: number; lastRunAt: string | null; createdAt: string; updatedAt: string; createdBy: { id: string; firstName: string; lastName: string } | null };
export type AutomationLog = { id: string; status: AutomationRunStatus; triggerPayload: Record<string, unknown>; conditionResults: unknown[]; actionResults: unknown[]; error: string | null; startedAt: string; completedAt: string | null; contact: { id: string; name: string; phoneE164: string } | null };
export type AutomationPage = { items: Automation[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean } };
export type AutomationLogPage = { items: AutomationLog[]; pagination: AutomationPage["pagination"] };
