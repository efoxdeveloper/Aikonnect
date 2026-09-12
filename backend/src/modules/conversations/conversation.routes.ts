import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireAnyWorkspacePermission, requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./conversation.controller.js";
import { contactConversationParamsSchema, conversationListQuerySchema, conversationParamsSchema, createConversationSchema, createMessageSchema, inboxConversationListQuerySchema, workspaceConversationParamsSchema } from "./conversation.schemas.js";

export const conversationRouter = Router({ mergeParams: true });
conversationRouter.get("/", requireWorkspacePermission(PERMISSIONS.CONTACTS_READ), validateParams(contactConversationParamsSchema), validateQuery(conversationListQuerySchema), asyncHandler(controller.list));
conversationRouter.post("/", requireWorkspacePermission(PERMISSIONS.CONTACTS_UPDATE), validateParams(contactConversationParamsSchema), validateBody(createConversationSchema), asyncHandler(controller.create));
conversationRouter.get("/history", requireWorkspacePermission(PERMISSIONS.CONTACTS_READ), validateParams(contactConversationParamsSchema), validateQuery(conversationListQuerySchema), asyncHandler(controller.history));
conversationRouter.get("/:conversationId/messages", requireAnyWorkspacePermission(PERMISSIONS.CONTACTS_READ, PERMISSIONS.INBOX_READ), validateParams(conversationParamsSchema), validateQuery(conversationListQuerySchema), asyncHandler(controller.messages));
conversationRouter.get("/:conversationId/messages/:messageId/media", requireAnyWorkspacePermission(PERMISSIONS.CONTACTS_READ, PERMISSIONS.INBOX_READ), validateParams(conversationParamsSchema.extend({ messageId: z.uuid() })), asyncHandler(controller.media));
conversationRouter.post("/:conversationId/read", requireAnyWorkspacePermission(PERMISSIONS.CONTACTS_READ, PERMISSIONS.INBOX_READ), validateParams(conversationParamsSchema), asyncHandler(controller.markRead));
conversationRouter.post("/:conversationId/messages", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_REPLY), validateParams(conversationParamsSchema), validateBody(createMessageSchema), asyncHandler(controller.createMessage));

export const inboxRouter = Router({ mergeParams: true });
inboxRouter.get("/", requireWorkspacePermission(PERMISSIONS.INBOX_READ), validateParams(workspaceConversationParamsSchema), validateQuery(inboxConversationListQuerySchema), asyncHandler(controller.inboxList));
