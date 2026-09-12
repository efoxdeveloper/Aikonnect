import { z } from "zod";

export const conversationStatus = z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]);
export const messageDirection = z.enum(["INCOMING", "OUTGOING"]);
export const messageStatus = z.enum(["SENT", "DELIVERED", "READ", "FAILED"]);
export const messageType = z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "LOCATION", "CONTACT", "INTERACTIVE"]);

export const contactConversationParamsSchema = z.object({ workspaceId: z.uuid(), contactId: z.uuid() });
export const conversationParamsSchema = contactConversationParamsSchema.extend({ conversationId: z.uuid() });
export const conversationListQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const workspaceConversationParamsSchema = z.object({ workspaceId: z.uuid() });
export const inboxConversationListQuerySchema = conversationListQuerySchema.extend({
  status: conversationStatus.optional(),
  channelKey: z.string().trim().max(50).optional(),
  search: z.string().trim().max(200).default(""),
  unreadOnly: z.preprocess((value) => value === "true", z.boolean().default(false)),
});
export const createConversationSchema = z.object({ channelKey: z.string().trim().min(1).max(50).default("whatsapp"), phoneNumberId: z.uuid().optional(), status: conversationStatus.default("OPEN") });
export const createMessageSchema = z.object({
  metaMessageId: z.string().trim().min(1).max(200).optional(),
  direction: messageDirection,
  type: messageType,
  status: messageStatus.default("SENT"),
  text: z.string().max(100_000).nullable().optional(),
  mediaId: z.string().max(255).nullable().optional(),
  mediaUrl: z.string().max(10_000).nullable().optional(),
  mediaData: z.string().regex(/^data:[^;]+;base64,[A-Za-z0-9+/=]+$/).max(8_000_000).optional(),
  mediaFileName: z.string().trim().max(255).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  sentAt: z.iso.datetime({ offset: true }).optional(),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type InboxConversationListQuery = z.infer<typeof inboxConversationListQuerySchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
