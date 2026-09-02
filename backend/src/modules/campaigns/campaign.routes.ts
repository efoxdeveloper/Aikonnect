import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./campaign.controller.js";
import { campaignIdParamsSchema, campaignListQuerySchema, campaignWorkspaceParamsSchema, createCampaignSchema } from "./campaign.schemas.js";

export const campaignRouter = Router({ mergeParams: true });
campaignRouter.use(validateParams(campaignWorkspaceParamsSchema));
campaignRouter.get("/", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_READ), validateQuery(campaignListQuerySchema), asyncHandler(controller.list));
campaignRouter.post("/", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateBody(createCampaignSchema), asyncHandler(controller.create));
campaignRouter.get("/:campaignId", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_READ), validateParams(campaignIdParamsSchema), asyncHandler(controller.get));
campaignRouter.post("/:campaignId/duplicate", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_CREATE), validateParams(campaignIdParamsSchema), asyncHandler(controller.duplicate));
campaignRouter.delete("/:campaignId", requireWorkspacePermission(PERMISSIONS.CAMPAIGNS_DELETE), validateParams(campaignIdParamsSchema), asyncHandler(controller.remove));
