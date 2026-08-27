import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as workspaceService from "./workspace.service.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.listWorkspaces(requireAuth(request).userId) });
}

export async function create(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await workspaceService.createWorkspace(requireAuth(request).userId, request.body) });
}

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.getWorkspace(request.params.workspaceId as string) });
}

export async function setup(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await workspaceService.getWorkspaceSetup(request.params.workspaceId as string),
  });
}

export async function update(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.updateWorkspace(request.params.workspaceId as string, request.body) });
}

export async function remove(request: Request, response: Response) {
  await workspaceService.deleteWorkspace(request.params.workspaceId as string, requireAuth(request).userId);
  response.status(204).send();
}

export async function completeOnboarding(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await workspaceService.completeWorkspaceOnboarding(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.body,
    ),
  });
}

export async function members(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.listMembers(request.params.workspaceId as string) });
}

export async function invite(request: Request, response: Response) {
  const auth = requireAuth(request);
  response.status(201).json({ success: true, data: await workspaceService.inviteMember(request.params.workspaceId as string, auth.userId, request.body) });
}

export async function invitations(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.listInvitations(request.params.workspaceId as string) });
}

export async function revokeInvitation(request: Request, response: Response) {
  await workspaceService.revokeInvitation(request.params.workspaceId as string, request.params.invitationId as string);
  response.status(204).send();
}

export async function acceptInvitation(request: Request, response: Response) {
  const auth = requireAuth(request);
  response.status(201).json({ success: true, data: await workspaceService.acceptInvitation(auth.userId, auth.email, request.body.token) });
}

export async function roles(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.listRoles(request.params.workspaceId as string) });
}

export async function permissions(_request: Request, response: Response) {
  response.status(200).json({ success: true, data: workspaceService.listPermissionCatalog() });
}

export async function createRole(request: Request, response: Response) {
  response.status(201).json({ success: true, data: await workspaceService.createRole(request.params.workspaceId as string, request.body) });
}

export async function updateRole(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await workspaceService.updateRole(request.params.workspaceId as string, request.params.roleId as string, request.body) });
}

export async function deleteRole(request: Request, response: Response) {
  await workspaceService.deleteRole(request.params.workspaceId as string, request.params.roleId as string);
  response.status(204).send();
}

export async function changeMemberRole(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await workspaceService.changeMemberRole(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.params.membershipId as string,
      request.body.roleId,
    ),
  });
}

export async function changeMemberStatus(request: Request, response: Response) {
  response.status(200).json({
    success: true,
    data: await workspaceService.changeMemberStatus(
      request.params.workspaceId as string,
      requireAuth(request).userId,
      request.params.membershipId as string,
      request.body.status,
    ),
  });
}

export async function removeMember(request: Request, response: Response) {
  await workspaceService.removeMember(
    request.params.workspaceId as string,
    requireAuth(request).userId,
    request.params.membershipId as string,
  );
  response.status(204).send();
}
