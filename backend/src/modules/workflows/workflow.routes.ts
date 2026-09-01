import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./workflow.controller.js";
import { createWorkflowSchema, workflowIdParamsSchema, workflowListQuerySchema, workflowWorkspaceParamsSchema } from "./workflow.schemas.js";

export const workflowRouter = Router({ mergeParams: true });
workflowRouter.get("/", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_READ), validateParams(workflowWorkspaceParamsSchema), validateQuery(workflowListQuerySchema), asyncHandler(controller.list));
workflowRouter.post("/", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(workflowWorkspaceParamsSchema), validateBody(createWorkflowSchema), asyncHandler(controller.create));
workflowRouter.get("/:workflowId", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_READ), validateParams(workflowIdParamsSchema), asyncHandler(controller.get));
workflowRouter.put("/:workflowId", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(workflowIdParamsSchema), validateBody(createWorkflowSchema), asyncHandler(controller.update));
workflowRouter.delete("/:workflowId", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(workflowIdParamsSchema), asyncHandler(controller.remove));
workflowRouter.post("/:workflowId/activate", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(workflowIdParamsSchema), asyncHandler(controller.activate));
workflowRouter.post("/:workflowId/pause", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateParams(workflowIdParamsSchema), asyncHandler(controller.pause));
