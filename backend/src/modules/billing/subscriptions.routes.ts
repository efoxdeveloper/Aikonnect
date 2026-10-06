import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import { usageParamsSchema } from "../usage/usage.schemas.js";
import * as controller from "./subscriptions.controller.js";
import * as requestsController from "./plan-requests.controller.js";
import { planRequestCreateSchema } from "./plan-requests.schemas.js";

export const subscriptionsRouter = Router({ mergeParams: true });
subscriptionsRouter.get("/", requireWorkspacePermission(PERMISSIONS.BILLING_READ), validateParams(usageParamsSchema), asyncHandler(controller.list));
subscriptionsRouter.get("/requests", requireWorkspacePermission(PERMISSIONS.BILLING_READ), validateParams(usageParamsSchema), asyncHandler(requestsController.listWorkspace));
subscriptionsRouter.post("/requests", requireWorkspacePermission(PERMISSIONS.BILLING_MANAGE), validateParams(usageParamsSchema), validateBody(planRequestCreateSchema), asyncHandler(requestsController.create));
