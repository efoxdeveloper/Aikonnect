import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./automation.controller.js";
import { automationIdParamsSchema, automationListQuerySchema, automationWorkspaceParamsSchema, createAutomationSchema } from "./automation.schemas.js";

export const automationRouter = Router({ mergeParams: true });
automationRouter.get("/", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_READ), validateParams(automationWorkspaceParamsSchema), validateQuery(automationListQuerySchema), asyncHandler(controller.list));
automationRouter.post("/", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(automationWorkspaceParamsSchema), validateBody(createAutomationSchema), asyncHandler(controller.create));
automationRouter.get("/:automationId", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_READ), validateParams(automationIdParamsSchema), asyncHandler(controller.get));
automationRouter.put("/:automationId", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(automationIdParamsSchema), validateBody(createAutomationSchema), asyncHandler(controller.update));
automationRouter.delete("/:automationId", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(automationIdParamsSchema), asyncHandler(controller.remove));
automationRouter.post("/:automationId/activate", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(automationIdParamsSchema), asyncHandler(controller.activate));
automationRouter.post("/:automationId/pause", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(automationIdParamsSchema), asyncHandler(controller.pause));
automationRouter.get("/:automationId/logs", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_READ), validateParams(automationIdParamsSchema), asyncHandler(controller.logs));
