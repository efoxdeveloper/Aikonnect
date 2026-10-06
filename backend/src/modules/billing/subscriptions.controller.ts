import type { Request, Response } from "express";
import * as service from "./subscriptions.service.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listWorkspaceSubscriptions(request.params.workspaceId as string) });
}
