import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./workflow.service.js";
import type { WorkflowListQuery } from "./workflow.schemas.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listWorkflows(request.params.workspaceId as string, request.validatedQuery as WorkflowListQuery) }); }
export async function get(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.getWorkflow(request.params.workspaceId as string, request.params.workflowId as string) }); }
export async function create(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.createWorkflow(request.params.workspaceId as string, requireAuth(request).userId, request.body) }); }
export async function update(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.updateWorkflow(request.params.workspaceId as string, request.params.workflowId as string, request.body) }); }
export async function remove(request: Request, response: Response) { await service.deleteWorkflow(request.params.workspaceId as string, request.params.workflowId as string); response.status(204).send(); }
export async function activate(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.setWorkflowStatus(request.params.workspaceId as string, request.params.workflowId as string, "ACTIVE") }); }
export async function pause(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.setWorkflowStatus(request.params.workspaceId as string, request.params.workflowId as string, "PAUSED") }); }
