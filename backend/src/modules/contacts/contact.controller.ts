import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as contactService from "./contact.service.js";
import type { ListContactsQuery, ListContactSegmentsQuery } from "./contact.schemas.js";

function visibility(request: Request) {
  const permissions = request.workspaceAccess?.permissions ?? [];
  return {
    canViewPhone: permissions.includes(PERMISSIONS.CONTACTS_PHONE_VIEW),
    canViewFields: permissions.includes(PERMISSIONS.CONTACTS_FIELDS_VIEW),
  };
}

export async function list(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.listContacts(
      request.params.workspaceId as string,
      request.validatedQuery as ListContactsQuery,
      visibility(request),
    ),
  });
}

export async function get(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.getContact(
      request.params.workspaceId as string,
      request.params.contactId as string,
      visibility(request),
    ),
  });
}

export async function create(request: Request, response: Response) {
  response.status(201).json({
    success: true,
    data: await contactService.createContact(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.body,
      visibility(request),
    ),
  });
}

export async function update(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.updateContact(
      request.params.workspaceId as string,
      request.params.contactId as string,
      requireAuth(request).userId,
      request.body,
      visibility(request),
    ),
  });
}

export async function remove(request: Request, response: Response) {
  await contactService.deleteContact(
    request.params.workspaceId as string,
    request.params.contactId as string,
    requireAuth(request).userId,
  );
  response.status(204).send();
}

export async function bulkDelete(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.bulkDeleteContacts(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}

export async function tags(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.listTags(
      request.params.workspaceId as string,
      (request.validatedQuery as { search?: string }).search,
    ),
  });
}

export async function segments(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await contactService.listSegments(request.params.workspaceId as string, request.validatedQuery as ListContactSegmentsQuery) });
}

export async function createSegment(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await contactService.createSegment(request.params.workspaceId as string, requireAuth(request).userId, request.body) });
}

export async function updateSegment(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.updateSegment(
      request.params.workspaceId as string,
      request.params.segmentId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}

export async function deleteSegment(request: Request, response: Response) {
  await contactService.deleteSegment(
    request.params.workspaceId as string,
    request.params.segmentId as string,
  );
  response.status(204).send();
}

export async function bulkTags(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.bulkTagContacts(request.params.workspaceId as string, request.body),
  });
}

export async function marketingEligibility(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await contactService.getMarketingEligibility(request.params.workspaceId as string, request.body),
  });
}

export async function importMany(request: Request, response: Response) {
  response.status(201).json({
    success: true,
    data: await contactService.importContacts(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}
