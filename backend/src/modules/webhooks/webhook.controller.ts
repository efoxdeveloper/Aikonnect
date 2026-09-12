import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./webhook.service.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listWebhooks(request.params.workspaceId as string) });
}

export async function create(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await service.createWebhook(request.params.workspaceId as string, requireAuth(request).userId, request.body) });
}

export async function remove(request: Request, response: Response) {
  await service.deleteWebhook(request.params.workspaceId as string, request.params.webhookId as string);
  response.status(204).send();
}
