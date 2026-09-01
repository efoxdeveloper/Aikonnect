import type { Prisma } from "../../generated/prisma/client.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import { sendAutomationText } from "../whatsapp/whatsapp.service.js";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
} from "./automation.schemas.js";

type Scalar = string | number | boolean | null | undefined;
export type EventContext = {
  contactId?: string;
  conversationId?: string;
  triggerPayload?: Record<string, unknown>;
  message?: { id?: string; text?: string; type?: string; phoneNumber?: string };
};
type ContactSnapshot = {
  id: string;
  name: string;
  phoneE164: string;
  email: string | null;
  customAttributes: Prisma.JsonValue;
  tagAssignments: Array<{ tag: { name: string } }>;
};
type ConversationSnapshot = { id: string; status: string } | null;
type EvaluationContext = {
  contact: ContactSnapshot | null;
  conversation: ConversationSnapshot;
  message?: EventContext["message"];
  variables?: Record<string, unknown>;
};

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
function normalized(value: Scalar): string {
  return asString(value).trim().toLowerCase();
}

function valueAt(path: string, context: EvaluationContext): unknown {
  const [root, ...parts] = path.split(".");
  if (root === "variables")
    return parts.reduce<unknown>(
      (value, part) => asRecord(value)[part],
      context.variables ?? {},
    );
  if (root && context.variables && root in context.variables)
    return parts.reduce<unknown>(
      (value, part) => asRecord(value)[part],
      context.variables[root],
    );
  if (root === "message")
    return parts.reduce<unknown>(
      (value, part) => asRecord(value)[part],
      context.message ?? {},
    );
  if (root === "conversation")
    return parts.reduce<unknown>(
      (value, part) => asRecord(value)[part],
      context.conversation ?? {},
    );
  if (root !== "contact" || !context.contact) return undefined;
  if (path === "contact.phone") return context.contact.phoneE164;
  if (path === "contact.tags")
    return context.contact.tagAssignments.map(({ tag }) => tag.name);
  if (path === "contact.custom") return context.contact.customAttributes;
  if (parts[0] === "custom")
    return parts
      .slice(1)
      .reduce<unknown>(
        (value, part) => asRecord(value)[part],
        context.contact.customAttributes,
      );
  return parts.reduce<unknown>(
    (value, part) => asRecord(value)[part],
    context.contact,
  );
}

function matches(
  operator: AutomationCondition["operator"],
  actual: unknown,
  expected: unknown,
): boolean {
  const actualList = Array.isArray(actual) ? actual : [actual];
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const actualText = normalized(actual as Scalar);
  const expectedText = normalized(expected as Scalar);
  switch (operator) {
    case "equals":
    case "is":
      return actualList.some(
        (item) => normalized(item as Scalar) === expectedText,
      );
    case "not_equals":
    case "is_not":
      return actualList.every(
        (item) => normalized(item as Scalar) !== expectedText,
      );
    case "contains":
      return actualList.some((item) =>
        normalized(item as Scalar).includes(expectedText),
      );
    case "not_contains":
      return actualList.every(
        (item) => !normalized(item as Scalar).includes(expectedText),
      );
    case "starts_with":
      return actualText.startsWith(expectedText);
    case "ends_with":
      return actualText.endsWith(expectedText);
    case "is_empty":
      return actualList.every(
        (item) => item == null || normalized(item as Scalar) === "",
      );
    case "is_not_empty":
      return actualList.some(
        (item) => item != null && normalized(item as Scalar) !== "",
      );
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "greater_than_or_equal":
      return Number(actual) >= Number(expected);
    case "less_than_or_equal":
      return Number(actual) <= Number(expected);
    case "is_any_of":
      return actualList.some((item) =>
        expectedList.some(
          (candidate) =>
            normalized(item as Scalar) === normalized(candidate as Scalar),
        ),
      );
    case "is_none_of":
      return actualList.every((item) =>
        expectedList.every(
          (candidate) =>
            normalized(item as Scalar) !== normalized(candidate as Scalar),
        ),
      );
    default:
      return false;
  }
}

export function evaluateCondition(
  condition: AutomationCondition,
  context: EvaluationContext,
): boolean {
  return matches(
    condition.operator,
    valueAt(condition.field, context),
    condition.value,
  );
}

function renderMessage(template: string, context: EvaluationContext) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) =>
    asString(valueAt(path, context)),
  );
}

export async function loadContext(workspaceId: string, event: EventContext) {
  const [contact, conversation] = await Promise.all([
    event.contactId
      ? prisma.contact.findFirst({
          where: { id: event.contactId, workspaceId, deletedAt: null },
          select: {
            id: true,
            name: true,
            phoneE164: true,
            email: true,
            customAttributes: true,
            tagAssignments: { include: { tag: { select: { name: true } } } },
          },
        })
      : null,
    event.conversationId
      ? prisma.conversation.findFirst({
          where: { id: event.conversationId, workspaceId },
          select: { id: true, status: true },
        })
      : null,
  ]);
  return { contact, conversation, message: event.message };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function executeAction(
  workspaceId: string,
  action: AutomationAction,
  context: Awaited<ReturnType<typeof loadContext>> & {
    variables?: Record<string, unknown>;
  },
) {
  const config = asRecord(action.config);
  if (!context.contact)
    throw new Error("The contact for this automation event no longer exists");
  switch (action.type) {
    case "SEND_MESSAGE": {
      if (!context.conversation)
        throw new Error(
          "The conversation for this automation event no longer exists",
        );
      const text = renderMessage(asString(config.message), context);
      const message = await sendAutomationText(
        workspaceId,
        context.conversation.id,
        text,
      );
      return {
        status: "SUCCESS",
        detail: `Message sent (${message.metaMessageId ?? "accepted"})`,
      };
    }
    case "ADD_TAG": {
      const tagId = asString(config.tagId);
      const tag = await prisma.contactTag.findFirst({
        where: { id: tagId, workspaceId },
        select: { id: true, name: true },
      });
      if (!tag) throw new Error("The configured tag no longer exists");
      await prisma.contactTagAssignment.upsert({
        where: {
          contactId_tagId: { contactId: context.contact.id, tagId: tag.id },
        },
        create: { contactId: context.contact.id, tagId: tag.id },
        update: {},
      });
      return { status: "SUCCESS", detail: `Tag added: ${tag.name}` };
    }
    case "REMOVE_TAG": {
      const tagId = asString(config.tagId);
      await prisma.contactTagAssignment.deleteMany({
        where: { contactId: context.contact.id, tagId },
      });
      return { status: "SUCCESS", detail: "Tag removed" };
    }
    case "ADD_INTERNAL_NOTE": {
      const content = renderMessage(asString(config.message), context);
      await prisma.contactNote.create({
        data: {
          workspaceId,
          contactId: context.contact.id,
          title: "Automation note",
          content,
        },
      });
      return { status: "SUCCESS", detail: "Internal note added" };
    }
    case "UPDATE_CUSTOM_FIELD": {
      const field = asString(config.field);
      if (!field) throw new Error("The custom field is missing");
      const attributes = asRecord(context.contact.customAttributes);
      await prisma.contact.update({
        where: { id: context.contact.id },
        data: {
          customAttributes: json({
            ...attributes,
            [field]: config.value ?? "",
          }),
        },
      });
      return { status: "SUCCESS", detail: `Custom field updated: ${field}` };
    }
    case "CLOSE_CONVERSATION":
    case "REOPEN_CONVERSATION":
    case "CHANGE_CONVERSATION_STATUS": {
      if (!context.conversation)
        throw new Error(
          "The conversation for this automation event no longer exists",
        );
      const status =
        action.type === "CLOSE_CONVERSATION"
          ? "CLOSED"
          : action.type === "REOPEN_CONVERSATION"
            ? "OPEN"
            : asString(config.status).toUpperCase();
      if (!["OPEN", "PENDING", "RESOLVED", "CLOSED"].includes(status))
        throw new Error("The conversation status is invalid");
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: { status: status as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED" },
      });
      return {
        status: "SUCCESS",
        detail: `Conversation changed to ${status.toLowerCase()}`,
      };
    }
    default:
      throw new Error(
        `${action.type.replaceAll("_", " ")} is not connected to a runtime service yet`,
      );
  }
}

export async function runAutomationsForEvent(
  workspaceId: string,
  triggerType: AutomationTrigger["type"],
  event: EventContext,
) {
  const automations = await prisma.automation.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: { id: true, trigger: true, conditions: true, actions: true },
  });
  for (const automation of automations) {
    const trigger = asRecord(automation.trigger);
    if (trigger.type !== triggerType) continue;
    const startedAt = new Date();
    const log = await prisma.automationLog.create({
      data: {
        automationId: automation.id,
        workspaceId,
        contactId: event.contactId ?? null,
        status: "RUNNING",
        triggerPayload: json(event.triggerPayload ?? { type: triggerType }),
        conditionResults: json([]),
        actionResults: json([]),
        startedAt,
      },
    });
    try {
      const context = await loadContext(workspaceId, event);
      const conditions = asArray<AutomationCondition>(automation.conditions);
      const conditionResults = conditions.map((condition) => ({
        id: condition.id,
        matched: evaluateCondition(condition, context),
      }));
      const matched =
        conditionResults.length === 0 ||
        conditions
          .slice(1)
          .reduce(
            (result, condition, index) =>
              condition.connector === "OR"
                ? result || Boolean(conditionResults[index + 1]?.matched)
                : result && Boolean(conditionResults[index + 1]?.matched),
            Boolean(conditionResults[0]?.matched),
          );
      if (!matched) {
        await prisma.automationLog.update({
          where: { id: log.id },
          data: {
            status: "SKIPPED",
            conditionResults: json(conditionResults),
            completedAt: new Date(),
          },
        });
        continue;
      }
      const actionResults: Array<Record<string, unknown>> = [];
      for (const action of asArray<AutomationAction>(automation.actions).sort(
        (left, right) => left.order - right.order,
      )) {
        try {
          actionResults.push({
            id: action.id,
            type: action.type,
            ...(await executeAction(workspaceId, action, context)),
          });
        } catch (error) {
          actionResults.push({
            id: action.id,
            type: action.type,
            status: "FAILED",
            error: error instanceof Error ? error.message : "Action failed",
          });
          throw error;
        }
      }
      await prisma.$transaction([
        prisma.automationLog.update({
          where: { id: log.id },
          data: {
            status: "SUCCESS",
            conditionResults: json(conditionResults),
            actionResults: json(actionResults),
            completedAt: new Date(),
          },
        }),
        prisma.automation.update({
          where: { id: automation.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date() },
        }),
      ]);
    } catch (error) {
      logger.error(
        {
          automationId: automation.id,
          workspaceId,
          error: error instanceof Error ? error.message : error,
        },
        "Automation execution failed",
      );
      await prisma.automationLog
        .update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            error:
              error instanceof Error
                ? error.message
                : "Automation execution failed",
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }
}
