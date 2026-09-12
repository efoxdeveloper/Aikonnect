import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./conversation.service.js";
import type { ConversationListQuery, InboxConversationListQuery } from "./conversation.schemas.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listConversations(request.params.workspaceId as string, request.params.contactId as string, request.validatedQuery as ConversationListQuery) }); }
export async function create(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.createConversation(request.params.workspaceId as string, request.params.contactId as string, request.body) }); }
export async function messages(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listMessages(request.params.workspaceId as string, request.params.contactId as string, request.params.conversationId as string, request.validatedQuery as ConversationListQuery) }); }
export async function media(request: Request, response: Response) { const file = await service.getMessageMedia(request.params.workspaceId as string, request.params.contactId as string, request.params.conversationId as string, request.params.messageId as string); response.status(200).type(file.contentType).send(file.body); }
export async function markRead(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.markConversationRead(request.params.workspaceId as string, request.params.contactId as string, request.params.conversationId as string) }); }
export async function createMessage(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.createMessage(request.params.workspaceId as string, request.params.contactId as string, request.params.conversationId as string, requireAuth(request).userId, request.body) }); }
export async function history(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.contactHistory(request.params.workspaceId as string, request.params.contactId as string, request.validatedQuery as ConversationListQuery) }); }
export async function inboxList(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listInboxConversations(request.params.workspaceId as string, request.validatedQuery as InboxConversationListQuery) }); }
