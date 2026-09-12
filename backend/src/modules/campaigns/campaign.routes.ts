import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import { AppError } from "../../middleware/error-handler.js";
import * as controller from "./campaign.controller.js";
import { campaignIdParamsSchema, campaignListQuerySchema, campaignWorkspaceParamsSchema, createCampaignSchema } from "./campaign.schemas.js";

export const campaignRouter = Router({ mergeParams: true });
const requireSendPermissionForLive: RequestHandler = (request, _response, next) => {
  if (request.body?.launchMode !== "draft" && !request.workspaceAccess?.permissions.includes(PERMISSIONS.CAMPAIGNS_SEND)) {
    next(new AppError(403, "Your workspace role does not allow sending campaigns", "PERMISSION_DENIED"));
    return;
  }
  next();
};
campaignRouter.use(validateParams(campaignWorkspaceParamsSchema));
campaignRouter.get("/", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_READ), validateQuery(campaignListQuerySchema), asyncHandler(controller.list));
campaignRouter.post("/", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateBody(createCampaignSchema), requireSendPermissionForLive, asyncHandler(controller.create));
campaignRouter.get("/:campaignId", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_READ), validateParams(campaignIdParamsSchema), asyncHandler(controller.get));
campaignRouter.post("/:campaignId/duplicate", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateParams(campaignIdParamsSchema), asyncHandler(controller.duplicate));
campaignRouter.delete("/:campaignId", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_DELETE), validateParams(campaignIdParamsSchema), asyncHandler(controller.remove));
