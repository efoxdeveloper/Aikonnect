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
