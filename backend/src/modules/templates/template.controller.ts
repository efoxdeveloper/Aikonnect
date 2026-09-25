import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import { AppError } from "../../middleware/error-handler.js";
import { getWhatsAppTemplateCapabilities, uploadWhatsAppTemplateMedia } from "../whatsapp/whatsapp.service.js";
import type { AddLibraryTemplateInput, CreateTemplateInput, ListTemplatesQuery, TemplateLibraryQuery, UpdateTemplateInput } from "./template.schemas.js";
import * as service from "./template.service.js";
import { dispatchTemplateDeletion } from "./template-deletion.worker.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listTemplates(request.params.workspaceId as string, request.validatedQuery as ListTemplatesQuery) });
}

export async function sync(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.syncTemplatesFromMeta(request.params.workspaceId as string, requireAuth(request).userId) });
}

export async function library(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listTemplateLibrary(request.params.workspaceId as string, request.validatedQuery as TemplateLibraryQuery) });
}

export async function addLibraryTemplate(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await service.addTemplateFromLibrary(request.params.workspaceId as string, requireAuth(request).userId, request.body as AddLibraryTemplateInput) });
}

export async function uploadMedia(request: Request, response: Response) {
  if (!Buffer.isBuffer(request.body)) throw new AppError(422, "Template media bytes are required", "META_TEMPLATE_MEDIA_REQUIRED");
  const mimeType = typeof request.headers["x-file-type"] === "string" ? request.headers["x-file-type"] : "";
  const fileName = typeof request.headers["x-file-name"] === "string" ? request.headers["x-file-name"] : "template-media";
  const result = await uploadWhatsAppTemplateMedia(request.params.workspaceId as string, { bytes: request.body, mimeType, fileName });
  response.status(201).json({ success: true, data: result });
}

export async function capabilities(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await getWhatsAppTemplateCapabilities(request.params.workspaceId as string) });
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
  const workspaceId = request.params.workspaceId as string;
  const templateId = request.params.templateId as string;
  const result = await service.deleteTemplate(workspaceId, templateId, requireAuth(request).userId);
  if (result.queued) {
    dispatchTemplateDeletion(templateId);
    response.status(202).json({ success: true, data: { status: "DELETING" } });
    return;
  }
  response.status(204).send();
}

export async function restore(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.restoreTemplate(request.params.workspaceId as string, request.params.templateId as string, requireAuth(request).userId) });
}
