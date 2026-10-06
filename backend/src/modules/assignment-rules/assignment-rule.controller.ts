import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./assignment-rule.service.js";
import type { AssignmentRuleInput } from "./assignment-rule.schemas.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listAssignmentRules(request.params.workspaceId as string) }); }
export async function options(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.assignmentRuleOptions(request.params.workspaceId as string) }); }
export async function create(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.createAssignmentRule(request.params.workspaceId as string, requireAuth(request).userId, request.body as AssignmentRuleInput) }); }
export async function update(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.updateAssignmentRule(request.params.workspaceId as string, request.params.ruleId as string, request.body as AssignmentRuleInput) }); }
export async function remove(request: Request, response: Response) { await service.deleteAssignmentRule(request.params.workspaceId as string, request.params.ruleId as string); response.status(204).send(); }
export async function reorder(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.reorderAssignmentRules(request.params.workspaceId as string, (request.body as { ruleIds: string[] }).ruleIds) }); }
