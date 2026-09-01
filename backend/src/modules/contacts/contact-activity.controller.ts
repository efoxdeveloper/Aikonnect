import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import type { ActivityListQuery, WorkspaceTaskListQuery } from "./contact-activity.schemas.js";
import * as activityService from "./contact-activity.service.js";

export async function tasks(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await activityService.listTasks(request.params.workspaceId as string, request.params.contactId as string, request.validatedQuery as ActivityListQuery) });
}

export async function workspaceTasks(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await activityService.listWorkspaceTasks(request.params.workspaceId as string, request.validatedQuery as WorkspaceTaskListQuery) });
}

export async function createTask(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await activityService.createTask(request.params.workspaceId as string, request.params.contactId as string, requireAuth(request).userId, request.body) });
}

export async function updateTask(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await activityService.updateTask(request.params.workspaceId as string, request.params.contactId as string, request.params.taskId as string, requireAuth(request).userId, request.body) });
}

export async function notes(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await activityService.listNotes(request.params.workspaceId as string, request.params.contactId as string, request.validatedQuery as ActivityListQuery) });
}

export async function createNote(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await activityService.createNote(request.params.workspaceId as string, request.params.contactId as string, requireAuth(request).userId, request.body) });
}

export async function updateNote(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await activityService.updateNote(request.params.workspaceId as string, request.params.contactId as string, request.params.noteId as string, requireAuth(request).userId, request.body) });
}

export async function deleteNote(request: Request, response: Response) {
  await activityService.deleteNote(request.params.workspaceId as string, request.params.contactId as string, request.params.noteId as string, requireAuth(request).userId);
  response.status(204).send();
}
