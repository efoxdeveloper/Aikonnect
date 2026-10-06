import type { Request, Response } from "express";
import * as service from "./plan-requests.service.js";
import type { PlanRequestCreate } from "./plan-requests.schemas.js";

export async function create(request: Request, response: Response) {
  if (!request.auth) throw new Error("Authentication context is missing");
  const data = await service.createWorkspacePlanRequest(request.params.workspaceId as string, request.auth.userId, request.body as PlanRequestCreate);
  response.status(201).json({ success: true, data });
}

export async function listWorkspace(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listWorkspacePlanRequests(request.params.workspaceId as string) });
}
