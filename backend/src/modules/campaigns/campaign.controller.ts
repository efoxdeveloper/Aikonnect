import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import type { CampaignListQuery } from "./campaign.schemas.js";
import * as service from "./campaign.service.js";
import { dispatchCampaign } from "./campaign.worker.js";
import { AppError } from "../../middleware/error-handler.js";
import { uploadWhatsAppMedia } from "../whatsapp/whatsapp.service.js";
import { streamCampaignUpdates } from "../../realtime/campaign.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listCampaigns(request.params.workspaceId as string, request.validatedQuery as CampaignListQuery) }); }
export async function get(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.getCampaign(request.params.workspaceId as string, request.params.campaignId as string) }); }
export function events(request: Request, response: Response) { streamCampaignUpdates(request.params.workspaceId as string, request.params.campaignId as string, response); }
export async function control(request: Request, response: Response) {
  const campaign = await service.controlCampaign(request.params.workspaceId as string, request.params.campaignId as string, request.body.action);
  if (campaign.status === "RUNNING") void dispatchCampaign(campaign.id);
  response.status(200).json({ success: true, data: campaign });
}
export async function create(request: Request, response: Response) {
  const campaign = await service.createCampaign(request.params.workspaceId as string, requireAuth(request).userId, request.body);
  if (campaign.status === "RUNNING") void dispatchCampaign(campaign.id);
  response.status(201).json({ success: true, data: campaign });
}
export async function estimate(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.estimateCampaign(request.params.workspaceId as string, request.body) });
}
export async function uploadMedia(request: Request, response: Response) {
  if (!Buffer.isBuffer(request.body)) throw new AppError(422, "Campaign media bytes are required", "MEDIA_DATA_REQUIRED");
  const mimeType = typeof request.headers["x-file-type"] === "string" ? request.headers["x-file-type"] : "";
  const fileName = typeof request.headers["x-file-name"] === "string" ? request.headers["x-file-name"] : "campaign-media";
  const type = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "document";
  const result = await uploadWhatsAppMedia(request.params.workspaceId as string, { bytes: request.body, mimeType, fileName, type });
  response.status(201).json({ success: true, data: result });
}
export async function duplicate(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.duplicateCampaign(request.params.workspaceId as string, request.params.campaignId as string, requireAuth(request).userId) }); }
export async function remove(request: Request, response: Response) { await service.deleteCampaign(request.params.workspaceId as string, request.params.campaignId as string); response.status(204).send(); }
