import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./automation-settings.controller.js";
import { automationSettingsWorkspaceParamsSchema, updateAutomationSettingsSchema } from "./automation-settings.schemas.js";

export const automationSettingsRouter = Router({ mergeParams: true });
automationSettingsRouter.use(validateParams(automationSettingsWorkspaceParamsSchema));
automationSettingsRouter.get("/", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_READ), asyncHandler(controller.get));
automationSettingsRouter.patch("/", requireWorkspacePermission(PERMISSIONS.AUTOMATIONS_MANAGE), validateBody(updateAutomationSettingsSchema), asyncHandler(controller.update));
