import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import type { AssignmentRuleInput } from "./assignment-rule.schemas.js";

const ruleSelect = {
  id: true, workspaceId: true, name: true, priority: true, enabled: true, contactTagId: true,
  phoneNumberId: true, strategy: true, memberIds: true, roundRobinCursor: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ConversationAssignmentRuleSelect;

async function validateTargets(workspaceId: string, input: AssignmentRuleInput) {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      id: { in: input.memberIds },
      status: "ACTIVE",
      role: { permissions: { some: { permission: { key: PERMISSIONS.INBOX_READ } } } },
    },
    select: { id: true },
  });
  if (memberships.length !== input.memberIds.length) {
    throw new AppError(422, "Choose active workspace members who can access the inbox.", "ASSIGNMENT_RULE_MEMBER_INVALID");
  }
  if (input.contactTagId) {
    const tag = await prisma.contactTag.findFirst({ where: { id: input.contactTagId, workspaceId }, select: { id: true } });
    if (!tag) throw new AppError(422, "The selected contact tag is not available in this workspace.", "ASSIGNMENT_RULE_TAG_INVALID");
  }
  if (input.phoneNumberId) {
    const phoneNumber = await prisma.whatsAppPhoneNumber.findFirst({ where: { id: input.phoneNumberId, status: "ACTIVE", businessAccount: { workspaceId } }, select: { id: true } });
    if (!phoneNumber) throw new AppError(422, "The selected WhatsApp number is not available in this workspace.", "ASSIGNMENT_RULE_PHONE_INVALID");
  }
}

export async function listAssignmentRules(workspaceId: string) {
  const items = await prisma.conversationAssignmentRule.findMany({
    where: { workspaceId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], select: ruleSelect,
  });
  return { items };
}

export async function assignmentRuleOptions(workspaceId: string) {
  const [members, tags, phoneNumbers] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, status: "ACTIVE", role: { permissions: { some: { permission: { key: PERMISSIONS.INBOX_READ } } } } },
      select: { id: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    }),
    prisma.contactTag.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.whatsAppPhoneNumber.findMany({ where: { status: "ACTIVE", businessAccount: { workspaceId } }, select: { id: true, displayPhoneNumber: true, verifiedName: true }, orderBy: { displayPhoneNumber: "asc" } }),
  ]);
  return {
    members: members.map(({ id, user }) => ({ id, name: `${user.firstName} ${user.lastName}`.trim() || user.email, email: user.email })),
    tags,
    phoneNumbers: phoneNumbers.map(({ id, displayPhoneNumber, verifiedName }) => ({ id, name: verifiedName ? `${verifiedName} · ${displayPhoneNumber}` : displayPhoneNumber })),
  };
}

export async function createAssignmentRule(workspaceId: string, userId: string, input: AssignmentRuleInput) {
  await validateTargets(workspaceId, input);
  const last = await prisma.conversationAssignmentRule.findFirst({ where: { workspaceId }, orderBy: { priority: "desc" }, select: { priority: true } });
  return prisma.conversationAssignmentRule.create({
    data: { workspaceId, createdById: userId, priority: (last?.priority ?? -1) + 1, ...input },
    select: ruleSelect,
  });
}

export async function updateAssignmentRule(workspaceId: string, ruleId: string, input: AssignmentRuleInput) {
  await validateTargets(workspaceId, input);
  const exists = await prisma.conversationAssignmentRule.findFirst({ where: { id: ruleId, workspaceId }, select: { id: true } });
  if (!exists) throw new AppError(404, "Assignment rule was not found.", "ASSIGNMENT_RULE_NOT_FOUND");
  return prisma.conversationAssignmentRule.update({
    where: { id: ruleId }, data: { ...input, roundRobinCursor: 0 }, select: ruleSelect,
  });
}

export async function deleteAssignmentRule(workspaceId: string, ruleId: string) {
  const result = await prisma.conversationAssignmentRule.deleteMany({ where: { id: ruleId, workspaceId } });
  if (!result.count) throw new AppError(404, "Assignment rule was not found.", "ASSIGNMENT_RULE_NOT_FOUND");
}

export async function reorderAssignmentRules(workspaceId: string, ruleIds: string[]) {
  if (new Set(ruleIds).size !== ruleIds.length) throw new AppError(422, "A rule can only appear once in the order.", "ASSIGNMENT_RULE_ORDER_INVALID");
  const existing = await prisma.conversationAssignmentRule.findMany({ where: { workspaceId }, select: { id: true } });
  if (existing.length !== ruleIds.length || existing.some(({ id }) => !ruleIds.includes(id))) {
    throw new AppError(422, "The order must include every assignment rule in this workspace.", "ASSIGNMENT_RULE_ORDER_INVALID");
  }
  await prisma.$transaction(ruleIds.map((id, priority) => prisma.conversationAssignmentRule.update({ where: { id }, data: { priority } })));
  return listAssignmentRules(workspaceId);
}

/** Applies the first matching rule to an unassigned conversation after an inbound message. */
export async function applyAssignmentRules(workspaceId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId, deletedAt: null, assigneeMembershipId: null },
    select: { id: true, contactId: true, phoneNumberId: true },
  });
  if (!conversation) return null;

  const rules = await prisma.conversationAssignmentRule.findMany({
    where: { workspaceId, enabled: true }, orderBy: [{ priority: "asc" }, { id: "asc" }], select: ruleSelect,
  });
  for (const rule of rules) {
    if (rule.phoneNumberId && rule.phoneNumberId !== conversation.phoneNumberId) continue;
    if (rule.contactTagId) {
      const match = await prisma.contactTagAssignment.findUnique({ where: { contactId_tagId: { contactId: conversation.contactId, tagId: rule.contactTagId } }, select: { contactId: true } });
      if (!match) continue;
    }
    const eligible = await prisma.workspaceMember.findMany({
      where: {
        workspaceId, id: { in: rule.memberIds }, status: "ACTIVE",
        role: { permissions: { some: { permission: { key: PERMISSIONS.INBOX_READ } } } },
      }, select: { id: true },
    });
    const eligibleIds = rule.memberIds.filter((id) => eligible.some((member) => member.id === id));
    if (!eligibleIds.length) continue;
    let assigneeId = eligibleIds[0]!;
    if (rule.strategy === "ROUND_ROBIN") {
      const updatedRule = await prisma.conversationAssignmentRule.update({ where: { id: rule.id }, data: { roundRobinCursor: { increment: 1 } }, select: { roundRobinCursor: true } });
      assigneeId = eligibleIds[(updatedRule.roundRobinCursor - 1) % eligibleIds.length]!;
    }
    const assigned = await prisma.conversation.updateMany({
      where: { id: conversation.id, workspaceId, assigneeMembershipId: null, deletedAt: null },
      data: { assigneeMembershipId: assigneeId, assignmentRuleId: rule.id, assignedAt: new Date() },
    });
    if (assigned.count) return { conversationId, assigneeMembershipId: assigneeId, ruleId: rule.id };
    return null;
  }
  return null;
}
