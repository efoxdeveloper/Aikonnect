import { Router, type RequestHandler } from "express";
import express from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import { AppError } from "../../middleware/error-handler.js";
import * as controller from "./campaign.controller.js";
import { campaignControlSchema, campaignIdParamsSchema, campaignListQuerySchema, campaignWorkspaceParamsSchema, createCampaignSchema, estimateCampaignSchema } from "./campaign.schemas.js";

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
campaignRouter.post("/media", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), express.raw({ type: "application/octet-stream", limit: "100mb" }), asyncHandler(controller.uploadMedia));
campaignRouter.post("/estimate", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateBody(estimateCampaignSchema), requireSendPermissionForLive, asyncHandler(controller.estimate));
campaignRouter.post("/", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateBody(createCampaignSchema), requireSendPermissionForLive, asyncHandler(controller.create));
campaignRouter.get("/:campaignId/events", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_READ), validateParams(campaignIdParamsSchema), controller.events);
campaignRouter.get("/:campaignId", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_READ), validateParams(campaignIdParamsSchema), asyncHandler(controller.get));
campaignRouter.post("/:campaignId/control", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_SEND), validateParams(campaignIdParamsSchema), validateBody(campaignControlSchema), asyncHandler(controller.control));
campaignRouter.post("/:campaignId/duplicate", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateParams(campaignIdParamsSchema), asyncHandler(controller.duplicate));
campaignRouter.delete("/:campaignId", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_DELETE), validateParams(campaignIdParamsSchema), asyncHandler(controller.remove));
