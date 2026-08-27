import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./contact-custom-field.service.js";
import type { ListContactCustomFieldsQuery } from "./contact-custom-field.schemas.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await service.listContactCustomFields(
      request.params.workspaceId as string,
      request.validatedQuery as ListContactCustomFieldsQuery,
    ),
  });
}

export async function create(request: Request, response: Response) {
  response.status(201).json({
    success: true,
    data: await service.createContactCustomField(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}

export async function update(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await service.updateContactCustomField(
      request.params.workspaceId as string,
      request.params.fieldId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}

export async function reorder(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await service.reorderContactCustomFields(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}

export async function archive(request: Request, response: Response) {
  await service.archiveContactCustomField(
    request.params.workspaceId as string,
    request.params.fieldId as string,
    requireAuth(request).userId,
  );
  response.status(204).send();
}
