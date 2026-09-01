import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./automation.service.js";
import type { AutomationListQuery } from "./automation.schemas.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listAutomations(request.params.workspaceId as string, request.validatedQuery as AutomationListQuery) }); }
export async function get(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.getAutomation(request.params.workspaceId as string, request.params.automationId as string) }); }
export async function create(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.createAutomation(request.params.workspaceId as string, requireAuth(request).userId, request.body) }); }
export async function update(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.updateAutomation(request.params.workspaceId as string, request.params.automationId as string, request.body) }); }
export async function remove(request: Request, response: Response) { await service.deleteAutomation(request.params.workspaceId as string, request.params.automationId as string); response.status(204).send(); }
export async function activate(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.setAutomationStatus(request.params.workspaceId as string, request.params.automationId as string, "ACTIVE") }); }
export async function pause(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.setAutomationStatus(request.params.workspaceId as string, request.params.automationId as string, "PAUSED") }); }
export async function logs(request: Request, response: Response) { const page = Number(request.query.page ?? 1); const pageSize = Number(request.query.pageSize ?? 25); response.status(200).json({ success: true, data: await service.listAutomationLogs(request.params.workspaceId as string, request.params.automationId as string, page, pageSize) }); }
