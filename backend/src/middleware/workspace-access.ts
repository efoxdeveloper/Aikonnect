import type { RequestHandler } from "express";
import { prisma } from "../database/prisma.js";
import type { PermissionKey } from "../modules/workspaces/permissions.js";
import { AppError } from "./error-handler.js";
import { requireAuth } from "./authenticate.js";

export function requireWorkspacePermission(permission: PermissionKey): RequestHandler {
  return requireAnyWorkspacePermission(permission);
}

export function requireAnyWorkspacePermission(...requiredPermissions: PermissionKey[]): RequestHandler {
  return async (request, _response, next) => {
    try {
      const auth = requireAuth(request);
      const workspaceId = request.params.workspaceId;
      if (typeof workspaceId !== "string") {
        throw new AppError(400, "Workspace ID is required", "WORKSPACE_ID_REQUIRED");
      }

      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: auth.userId } },
        include: {
          role: {
            include: {
              permissions: { include: { permission: { select: { key: true } } } },
            },
          },
        },
      });

      if (!membership || membership.status !== "ACTIVE") {
        throw new AppError(403, "You do not have access to this workspace", "WORKSPACE_ACCESS_DENIED");
      }

      const permissions = membership.role.permissions.map(({ permission: item }) => item.key);
      if (!requiredPermissions.some((permission) => permissions.includes(permission))) {
        throw new AppError(403, "Your workspace role does not allow this action", "PERMISSION_DENIED");
      }

      request.workspaceAccess = {
        workspaceId,
        membershipId: membership.id,
        roleId: membership.roleId,
        permissions,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
