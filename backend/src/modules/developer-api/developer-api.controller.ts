import type { Request, Response } from "express";
import * as service from "./developer-api.service.js";
import { requestIdempotencyKey, type SendMessageInput } from "./developer-api.schemas.js";

export async function sendMessage(request: Request, response: Response) {
  const apiKey = request.developerApiKey;
  if (!apiKey) throw new Error("Developer API authentication context is missing");
  const result = await service.sendTemplateMessage(apiKey.workspaceId, request.body as SendMessageInput, requestIdempotencyKey(request.headers["idempotency-key"]));
  response.status(result.replayed ? 200 : 202).json({ success: true, data: result.data });
}
