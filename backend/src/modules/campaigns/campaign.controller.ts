import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import type { CampaignListQuery } from "./campaign.schemas.js";
import * as service from "./campaign.service.js";
import { dispatchCampaign } from "./campaign.worker.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listCampaigns(request.params.workspaceId as string, request.validatedQuery as CampaignListQuery) }); }
export async function get(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.getCampaign(request.params.workspaceId as string, request.params.campaignId as string) }); }
export async function create(request: Request, response: Response) {
  const campaign = await service.createCampaign(request.params.workspaceId as string, requireAuth(request).userId, request.body);
  if (campaign.status === "RUNNING") void dispatchCampaign(campaign.id);
  response.status(201).json({ success: true, data: campaign });
}
export async function duplicate(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.duplicateCampaign(request.params.workspaceId as string, request.params.campaignId as string, requireAuth(request).userId) }); }
export async function remove(request: Request, response: Response) { await service.deleteCampaign(request.params.workspaceId as string, request.params.campaignId as string); response.status(204).send(); }
