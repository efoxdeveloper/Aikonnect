import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as whatsappService from "./whatsapp.service.js";

export async function completeEmbeddedSignup(request: Request, response: Response) {
  requireAuth(request);
  response.status(200).json({
    success: true,
    data: await whatsappService.completeEmbeddedSignup(request.params.workspaceId as string, request.body),
  });
}

export async function sendTestMessage(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await whatsappService.sendTestMessage(request.params.workspaceId as string, request.body.to) });
}

export async function sync(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await whatsappService.syncWhatsApp(request.params.workspaceId as string) });
}

export async function disconnect(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await whatsappService.disconnectWhatsApp(request.params.workspaceId as string) });
}
