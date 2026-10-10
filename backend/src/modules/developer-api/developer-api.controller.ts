import type { Request, Response } from "express";
import * as service from "./developer-api.service.js";
import { requestIdempotencyKey, type CreateApiCampaignInput, type PublicMessageInput, type SendMessageInput } from "./developer-api.schemas.js";

export function publicMessageResponse(result: { replayed: boolean; data: { messageId: string } }) {
  return {
    statusCode: result.replayed ? 200 : 201,
    body: {
      result: true,
      message: "Message created successfully",
      id: result.data.messageId,
    },
  };
}

export async function sendMessage(request: Request, response: Response) {
  const apiKey = request.developerApiKey;
  if (!apiKey) throw new Error("Developer API authentication context is missing");
  const result = await service.sendTemplateMessage(apiKey.workspaceId, request.body as SendMessageInput, requestIdempotencyKey(request.headers["idempotency-key"]));
  response.status(result.replayed ? 200 : 202).json({ success: true, data: result.data });
}

export async function sendPublicMessage(request: Request, response: Response) {
  const apiKey = request.developerApiKey;
  if (!apiKey) throw new Error("Developer API authentication context is missing");
  const result = await service.sendPublicMessage(apiKey.workspaceId, request.body as PublicMessageInput);
  const formatted = publicMessageResponse(result);
  response.status(formatted.statusCode).json(formatted.body);
}

export function apiCampaignResponse(campaign: { campaignId: string; name: string }) {
  return {
    result: true,
    message: "Api Campaign Created created successfully",
    data: { campaignId: campaign.campaignId, name: campaign.name, type: "PublicAPI" },
  };
}

export async function createApiCampaign(request: Request, response: Response) {
  const apiKey = request.developerApiKey;
  if (!apiKey) throw new Error("Developer API authentication context is missing");
  const campaign = await service.createApiCampaign(apiKey.workspaceId, request.body as CreateApiCampaignInput);
  response.status(201).json(apiCampaignResponse(campaign));
}
