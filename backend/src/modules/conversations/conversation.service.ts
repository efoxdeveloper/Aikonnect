import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { downloadWhatsAppMedia, sendWhatsAppConversationMedia, sendWhatsAppConversationText } from "../whatsapp/whatsapp.service.js";
import { publishInboxRefresh } from "../../realtime/inbox.js";
import type { ConversationListQuery, CreateConversationInput, CreateMessageInput, InboxConversationListQuery } from "./conversation.schemas.js";

const conversationSelect = {
  id: true, workspaceId: true, contactId: true, phoneNumberId: true, channelKey: true, status: true,
  unreadCount: true, lastMessagePreview: true, lastMessageAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ConversationSelect;

const messageSelect = {
  id: true, workspaceId: true, conversationId: true, contactId: true, metaMessageId: true, direction: true,
  type: true, status: true, text: true, mediaId: true, mediaUrl: true, payload: true, sentAt: true,
  deliveredAt: true, readAt: true, failedAt: true, failureReason: true, createdById: true, createdAt: true, updatedAt: true,
} satisfies Prisma.MessageSelect;

const inboxConversationSelect = {
  ...conversationSelect,
  contact: { select: { id: true, name: true, profileName: true, profileImageUrl: true, phoneE164: true } },
} satisfies Prisma.ConversationSelect;

async function requireContact(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId, deletedAt: null }, select: { id: true } });
  if (!contact) throw new AppError(404, "Contact was not found", "CONTACT_NOT_FOUND");
}

async function requireConversation(workspaceId: string, contactId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId, contactId }, select: conversationSelect });
  if (!conversation) throw new AppError(404, "Conversation was not found", "CONVERSATION_NOT_FOUND");
  return conversation;
}

export async function listConversations(workspaceId: string, contactId: string, query: ConversationListQuery) {
  await requireContact(workspaceId, contactId);
  const where = { workspaceId, contactId };
  const [total, items] = await prisma.$transaction([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({ where, select: conversationSelect, orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 } };
}

export async function listInboxConversations(workspaceId: string, query: InboxConversationListQuery) {
  const search = query.search.trim();
  const where: Prisma.ConversationWhereInput = {
    workspaceId,
    contact: { deletedAt: null },
    ...(query.status ? { status: query.status } : {}),
    ...(query.channelKey ? { channelKey: query.channelKey } : {}),
    ...(query.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    ...(search
      ? {
          OR: [
            { lastMessagePreview: { contains: search, mode: "insensitive" } },
            { contact: { name: { contains: search, mode: "insensitive" } } },
            { contact: { profileName: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      select: inboxConversationSelect,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
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

export async function createConversation(workspaceId: string, contactId: string, input: CreateConversationInput) {
  await requireContact(workspaceId, contactId);
  if (input.phoneNumberId) {
    const phoneNumber = await prisma.whatsAppPhoneNumber.findFirst({ where: { id: input.phoneNumberId, businessAccount: { workspaceId } }, select: { id: true } });
    if (!phoneNumber) throw new AppError(404, "WhatsApp phone number was not found", "WHATSAPP_PHONE_NUMBER_NOT_FOUND");
  }
  try {
    return await prisma.conversation.upsert({
      where: { workspaceId_contactId_channelKey: { workspaceId, contactId, channelKey: input.channelKey } },
      create: { workspaceId, contactId, phoneNumberId: input.phoneNumberId, channelKey: input.channelKey, status: input.status },
      update: { ...(input.phoneNumberId !== undefined ? { phoneNumberId: input.phoneNumberId } : {}), status: input.status },
      select: conversationSelect,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Foreign key")) throw new AppError(404, "WhatsApp phone number was not found", "WHATSAPP_PHONE_NUMBER_NOT_FOUND");
    throw error;
  }
}

export async function listMessages(workspaceId: string, contactId: string, conversationId: string, query: ConversationListQuery) {
  await requireConversation(workspaceId, contactId, conversationId);
  const where = { workspaceId, contactId, conversationId };
  const [total, items] = await prisma.$transaction([
    prisma.message.count({ where }),
    prisma.message.findMany({ where, select: messageSelect, orderBy: [{ sentAt: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
  ]);
  return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 } };
}

export async function getMessageMedia(workspaceId: string, contactId: string, conversationId: string, messageId: string) {
  await requireConversation(workspaceId, contactId, conversationId);
  return downloadWhatsAppMedia(workspaceId, conversationId, messageId);
}

export async function markConversationRead(workspaceId: string, contactId: string, conversationId: string) {
  const readAt = new Date();
  await prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.findFirst({
      where: { id: conversationId, workspaceId, contactId },
      select: { id: true },
    });
    if (!conversation) throw new AppError(404, "Conversation was not found", "CONVERSATION_NOT_FOUND");
    await transaction.message.updateMany({
      where: { workspaceId, contactId, conversationId, direction: "INCOMING", status: { not: "READ" } },
      data: { status: "READ", readAt },
    });
    await transaction.conversation.update({ where: { id: conversationId, workspaceId }, data: { unreadCount: 0 } });
  });
  return { readAt };
}

export async function createMessage(workspaceId: string, contactId: string, conversationId: string, actorUserId: string, input: CreateMessageInput) {
  const conversation = await requireConversation(workspaceId, contactId, conversationId);
  let sentAt = input.sentAt ? new Date(input.sentAt) : new Date();
  let metaMessageId = input.metaMessageId;
  let mediaId = input.mediaId;
  let mediaUrl = input.mediaUrl;
  if (input.direction === "OUTGOING" && input.type === "TEXT" && conversation.channelKey === "whatsapp") {
    if (typeof input.text !== "string" || !input.text.trim()) throw new AppError(422, "Message text cannot be empty", "MESSAGE_TEXT_REQUIRED");
    const sent = await sendWhatsAppConversationText(workspaceId, conversationId, input.text);
    metaMessageId = sent.metaMessageId;
    sentAt = sent.sentAt;
  }
  if (input.direction === "OUTGOING" && ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(input.type) && conversation.channelKey === "whatsapp") {
    const sent = await sendWhatsAppConversationMedia(workspaceId, conversationId, input.type as "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT", input.mediaData, input.mediaId ?? undefined, input.text?.trim() || undefined, input.mediaFileName);
    metaMessageId = sent.metaMessageId;
    mediaId = sent.mediaId;
    // Keep the provider media ID as the durable reference. The upload data URL is
    // only used for the immediate browser preview and must not bloat message rows.
    mediaUrl = input.mediaUrl;
    sentAt = sent.sentAt;
  }
  const result = await prisma.$transaction(async (transaction) => {
    if (metaMessageId) {
      const existing = await transaction.message.findUnique({ where: { workspaceId_metaMessageId: { workspaceId, metaMessageId } }, select: messageSelect });
      if (existing) return { message: existing, deduplicated: true };
    }
    const message = await transaction.message.create({
      data: {
        workspaceId, contactId, conversationId, metaMessageId, direction: input.direction, type: input.type,
        status: input.status, text: input.text, mediaId, mediaUrl, payload: input.payload as Prisma.InputJsonValue,
        sentAt, createdById: actorUserId,
        ...(input.status === "DELIVERED" ? { deliveredAt: sentAt } : {}),
        ...(input.status === "READ" ? { deliveredAt: sentAt, readAt: sentAt } : {}),
        ...(input.status === "FAILED" ? { failedAt: sentAt } : {}),
      },
      select: messageSelect,
    });
    await transaction.conversation.update({ where: { id: conversationId, workspaceId, contactId }, data: { lastMessagePreview: input.text ?? input.type, lastMessageAt: sentAt, ...(input.direction === "INCOMING" ? { unreadCount: { increment: 1 } } : {}) } });
    return { message, deduplicated: false };
  });
  if (!result.deduplicated) publishInboxRefresh(workspaceId, conversationId);
  return result;
}

export async function contactHistory(workspaceId: string, contactId: string, query: ConversationListQuery) {
  await requireContact(workspaceId, contactId);
  const conversations = await listConversations(workspaceId, contactId, { ...query, pageSize: 100 });
  const conversationIds = conversations.items.map(({ id }) => id);
  const messages = conversationIds.length ? await prisma.message.findMany({ where: { workspaceId, contactId, conversationId: { in: conversationIds } }, select: messageSelect, orderBy: [{ sentAt: "asc" }, { id: "asc" }], take: 500 }) : [];
  return { conversations: conversations.items, messages };
}
