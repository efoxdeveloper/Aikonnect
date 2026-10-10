import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import type { SequenceListQuery } from "./sequence.schemas.js";
import * as service from "./sequence.service.js";

export async function list(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.listSequences(request.params.workspaceId as string, request.validatedQuery as SequenceListQuery) }); }
export async function eligibleContacts(request: Request, response: Response) { const query = request.validatedQuery as { search?: string } | undefined; response.status(200).json({ success: true, data: await service.listEligibleContacts(request.params.workspaceId as string, String(query?.search ?? "")) }); }
export async function get(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.getSequence(request.params.workspaceId as string, request.params.sequenceId as string) }); }
export async function create(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.createSequence(request.params.workspaceId as string, requireAuth(request).userId, request.body) }); }
export async function update(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.updateSequence(request.params.workspaceId as string, request.params.sequenceId as string, request.body) }); }
export async function activate(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.setSequenceStatus(request.params.workspaceId as string, request.params.sequenceId as string, "ACTIVE") }); }
export async function pause(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.setSequenceStatus(request.params.workspaceId as string, request.params.sequenceId as string, "PAUSED") }); }
export async function remove(request: Request, response: Response) { await service.deleteSequence(request.params.workspaceId as string, request.params.sequenceId as string); response.status(204).send(); }
export async function enroll(request: Request, response: Response) { response.status(201).json({ success: true, data: await service.enrollContacts(request.params.workspaceId as string, request.params.sequenceId as string, request.body.contactIds) }); }
export async function stop(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.stopContactSequence(request.params.workspaceId as string, request.params.sequenceId as string, request.params.contactId as string) }); }
