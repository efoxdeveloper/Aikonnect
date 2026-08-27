import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import type { CreateTemplateInput, ListTemplatesQuery, UpdateTemplateInput } from "./template.schemas.js";
import * as service from "./template.service.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listTemplates(request.params.workspaceId as string, request.validatedQuery as ListTemplatesQuery) });
}

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.getTemplate(request.params.workspaceId as string, request.params.templateId as string) });
}

export async function create(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await service.createTemplate(request.params.workspaceId as string, requireAuth(request).userId, request.body as CreateTemplateInput) });
}

export async function update(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.updateTemplate(request.params.workspaceId as string, request.params.templateId as string, requireAuth(request).userId, request.body as UpdateTemplateInput) });
}

export async function remove(request: Request, response: Response) {
  await service.deleteTemplate(request.params.workspaceId as string, request.params.templateId as string, requireAuth(request).userId);
  response.status(204).send();
}

export async function restore(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.restoreTemplate(request.params.workspaceId as string, request.params.templateId as string, requireAuth(request).userId) });
}
