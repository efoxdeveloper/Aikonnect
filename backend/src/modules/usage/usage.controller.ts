import type { Request, Response } from "express";
import * as service from "./usage.service.js";
import type { UsageQuery } from "./usage.schemas.js";

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.getUsage(request.params.workspaceId as string, request.validatedQuery as UsageQuery) });
}
