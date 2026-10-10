import type { Request, Response } from "express";
import * as service from "./automation-settings.service.js";
import type { UpdateAutomationSettingsInput } from "./automation-settings.schemas.js";

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.getAutomationSettings(request.params.workspaceId as string) });
}

export async function update(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.updateAutomationSettings(request.params.workspaceId as string, request.body as UpdateAutomationSettingsInput) });
}
