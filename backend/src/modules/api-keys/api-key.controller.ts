import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./api-key.service.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listApiKeys(request.params.workspaceId as string) });
}

export async function create(request: Request, response: Response) {
  response.status(201).json({
    success: true,
    data: await service.createApiKey(request.params.workspaceId as string, requireAuth(request).userId, request.body),
  });
}

export async function revoke(request: Request, response: Response) {
  await service.revokeApiKey(request.params.workspaceId as string, request.params.apiKeyId as string);
  response.status(204).send();
}
