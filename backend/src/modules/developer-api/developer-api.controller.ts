import type { Request, Response } from "express";
import * as service from "./developer-api.service.js";
import { requestIdempotencyKey, type PublicMessageInput, type SendMessageInput } from "./developer-api.schemas.js";

export function publicMessageResponse(result: { replayed: boolean; data: { messageId: string } }) {
  return {
    statusCode: result.replayed ? 200 : 202,
    body: {
      result: true,
      message: result.replayed
        ? "Message was already queued. Check webhook for delivery status"
        : "Message queued for sending via Marento. Check webhook for delivery status",
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
