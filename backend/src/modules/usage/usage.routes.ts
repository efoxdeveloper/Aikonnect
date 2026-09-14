import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./usage.controller.js";
import { usageParamsSchema, usageQuerySchema } from "./usage.schemas.js";

export const usageRouter = Router({ mergeParams: true });
usageRouter.get("/", requireWorkspacePermission(PERMISSIONS.BILLING_READ), validateParams(usageParamsSchema), validateQuery(usageQuerySchema), asyncHandler(controller.get));
