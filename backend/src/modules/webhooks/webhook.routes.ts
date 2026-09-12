import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./webhook.controller.js";
import { createWebhookSchema, webhookIdParamsSchema, webhookWorkspaceParamsSchema } from "./webhook.schemas.js";

export const webhookRouter = Router({ mergeParams: true });
webhookRouter.use(validateParams(webhookWorkspaceParamsSchema));
webhookRouter.get("/", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), asyncHandler(controller.list));
webhookRouter.post("/", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), validateBody(createWebhookSchema), asyncHandler(controller.create));
webhookRouter.delete("/:webhookId", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), validateParams(webhookIdParamsSchema), asyncHandler(controller.remove));
