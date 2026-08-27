import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { generateSecureToken, hashToken } from "../../utils/crypto.js";
import { toSlug } from "../../utils/slug.js";
import { sendWorkspaceInvitationEmail } from "../../services/email.service.js";
import { createWorkspaceWithDefaults, permissionDefinitions } from "./permissions.js";
import type {
  CompleteWorkspaceOnboardingInput,
  CreateRoleInput,
  CreateWorkspaceInput,
  InviteMemberInput,
  UpdateRoleInput,
  UpdateWorkspaceInput,
} from "./workspace.schemas.js";

export async function listWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { joinedAt: "asc" },
    select: {
      id: true,
      joinedAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          companyName: true,
          companyWebsite: true,
          companyLocation: true,
          annualRevenue: true,
          country: true,
          timezone: true,
          onboardingCompletedAt: true,
          ownerId: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
      },
      role: {
        select: {
          id: true,
          name: true,
          slug: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    joinedAt: membership.joinedAt,
    ...membership.workspace,
    memberCount: membership.workspace._count.memberships,
    _count: undefined,
    role: {
      ...membership.role,
      permissions: membership.role.permissions.map(({ permission }) => permission.key),
    },
  }));
}

export async function createWorkspace(userId: string, input: CreateWorkspaceInput) {
  const canCreate = await prisma.workspaceMember.findFirst({
    where: { userId, status: "ACTIVE", role: { slug: { in: ["owner", "admin"] } } },
    select: { id: true },
  });
  if (!canCreate) throw new AppError(403, "Only workspace owners and admins can create a workspace", "WORKSPACE_CREATE_FORBIDDEN");
  return prisma.$transaction((transaction) =>
    createWorkspaceWithDefaults(transaction, userId, {
      ...input,
      companyWebsite: input.companyWebsite || undefined,
    }),
  );
}

export async function getWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      _count: { select: { memberships: true, roles: true, invitations: true } },
    },
  });
  if (!workspace) throw new AppError(404, "Workspace was not found", "WORKSPACE_NOT_FOUND");
  return workspace;
}

export async function getWorkspaceSetup(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      onboardingCompletedAt: true,
      setupProgress: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
      invitations: {
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        select: { id: true },
      },
      whatsappBusinessAccounts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          metaBusinessId: true,
          metaWabaId: true,
          displayName: true,
          status: true,
          connectedAt: true,
          lastSyncedAt: true,
          lastError: true,
          phoneNumbers: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              metaPhoneNumberId: true,
              displayPhoneNumber: true,
              verifiedName: true,
              status: true,
              qualityRating: true,
              messagingLimit: true,
              connectedAt: true,
              lastSyncedAt: true,
            },
          },
        },
      },
    },
  });
  if (!workspace) throw new AppError(404, "Workspace was not found", "WORKSPACE_NOT_FOUND");

  const whatsappConnected = workspace.whatsappBusinessAccounts.some(({ status }) => status === "CONNECTED");
  const phoneNumberConnected = workspace.whatsappBusinessAccounts.some(({ phoneNumbers }) =>
    phoneNumbers.some(({ status }) => status === "ACTIVE"),
  );
  const teammateInvited =
    workspace.memberships.length > 1 ||
    workspace.invitations.length > 0 ||
    Boolean(workspace.setupProgress?.teammateInvitedAt);
  const milestones = {
    workspaceCreated: Boolean(workspace.onboardingCompletedAt),
    whatsappConnected,
    phoneNumberConnected,
    teammateInvited,
    testMessageSent: Boolean(workspace.setupProgress?.testMessageSentAt),
  };
  const completedSteps = Object.values(milestones).filter(Boolean).length;
  const totalSteps = Object.keys(milestones).length;
  const status = whatsappConnected
    ? "CONNECTED"
    : workspace.whatsappBusinessAccounts.some((account) => account.status === "CONNECTING")
      ? "CONNECTING"
      : workspace.whatsappBusinessAccounts.some((account) => account.status === "ERROR")
        ? "ERROR"
        : "DISCONNECTED";

  return {
    workspace: { id: workspace.id, name: workspace.name },
    progress: {
      ...milestones,
      completedSteps,
      totalSteps,
      percentage: Math.round((completedSteps / totalSteps) * 100),
      completedAt: workspace.setupProgress?.completedAt ?? null,
    },
    whatsapp: {
      status,
      accountCount: workspace.whatsappBusinessAccounts.length,
      phoneNumberCount: workspace.whatsappBusinessAccounts.reduce(
        (count, account) => count + account.phoneNumbers.length,
        0,
      ),
      accounts: workspace.whatsappBusinessAccounts,
    },
    team: {
      memberCount: workspace.memberships.length,
      pendingInvitationCount: workspace.invitations.length,
    },
  };
}

export async function updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...input,
      companyWebsite: input.companyWebsite === "" ? null : input.companyWebsite,
      country: input.country === "" ? null : input.country,
      timezone: input.timezone === "" ? null : input.timezone,
      logoData: input.logoData === "" ? null : input.logoData,
    },
    include: {
      _count: { select: { memberships: true, roles: true, invitations: true } },
    },
  });
}

export async function deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
  if (!workspace) throw new AppError(404, "Workspace was not found", "WORKSPACE_NOT_FOUND");
  if (workspace.ownerId !== userId) throw new AppError(403, "Only the workspace owner can delete this workspace", "WORKSPACE_OWNER_REQUIRED");
  await prisma.workspace.delete({ where: { id: workspaceId } });
}

export async function completeWorkspaceOnboarding(
  workspaceId: string,
  userId: string,
  input: CompleteWorkspaceOnboardingInput,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true, onboardingCompletedAt: true },
  });
  if (!workspace) throw new AppError(404, "Workspace was not found", "WORKSPACE_NOT_FOUND");
  if (workspace.ownerId !== userId) {
    throw new AppError(403, "Only the workspace owner can complete onboarding", "WORKSPACE_OWNER_REQUIRED");
  }

  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: input.name,
      country: input.country,
      timezone: input.timezone,
      onboardingCompletedAt: workspace.onboardingCompletedAt ?? new Date(),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      country: true,
      timezone: true,
      onboardingCompletedAt: true,
    },
  });
}

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: [{ role: { slug: "asc" } }, { joinedAt: "asc" }],
    select: {
      id: true,
      status: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          emailVerifiedAt: true,
          status: true,
        },
      },
      role: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function inviteMember(workspaceId: string, invitedById: string, input: InviteMemberInput) {
  const role = await prisma.role.findFirst({ where: { id: input.roleId, workspaceId } });
  if (!role) throw new AppError(400, "The selected role does not belong to this workspace", "ROLE_INVALID");
  if (role.slug === "owner") throw new AppError(400, "Workspace ownership cannot be assigned by invitation", "OWNER_ROLE_RESERVED");

  const existingUser = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existingUser) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      select: { id: true },
    });
    if (membership) throw new AppError(409, "This user is already a workspace member", "MEMBER_EXISTS");
  }

  const token = generateSecureToken();
  const invitation = await prisma.$transaction(async (transaction) => {
    await transaction.workspaceInvitation.updateMany({
      where: { workspaceId, email: input.email, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    return transaction.workspaceInvitation.create({
      data: {
        workspaceId,
        email: input.email,
        roleId: input.roleId,
        invitedById,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        role: { select: { id: true, name: true } },
      },
    });
  });

  const invitationUrl = `${env.APP_URL}/invitations/accept?token=${token}`;
  let emailSent = false;
  try {
    emailSent = await sendWorkspaceInvitationEmail(input.email, (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } })).name, invitation.role.name, invitationUrl);
  } catch (error) {
    logger.error({ err: error }, "Workspace invitation email delivery failed");
  }

  return {
    ...invitation,
    emailSent,
    ...(env.NODE_ENV === "development"
      ? { invitationUrl }
      : {}),
  };
}

export async function listInvitations(workspaceId: string) {
  return prisma.workspaceInvitation.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      role: { select: { id: true, name: true, slug: true } },
      invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
  const result = await prisma.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  if (result.count !== 1) throw new AppError(404, "Pending invitation was not found", "INVITATION_NOT_FOUND");
}

export async function acceptInvitation(userId: string, userEmail: string, rawToken: string) {
  const tokenHash = hashToken(rawToken);
  return prisma.$transaction(async (transaction) => {
    const invitation = await transaction.workspaceInvitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.status !== "PENDING") {
      throw new AppError(400, "Invitation is invalid or no longer active", "INVITATION_INVALID");
    }
    if (invitation.expiresAt <= new Date()) {
      await transaction.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      throw new AppError(400, "Invitation has expired", "INVITATION_EXPIRED");
    }
    if (invitation.email !== userEmail.toLowerCase()) {
      throw new AppError(403, "This invitation belongs to another email address", "INVITATION_EMAIL_MISMATCH");
    }
    const existing = await transaction.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
    });
    if (existing) throw new AppError(409, "You are already a member of this workspace", "MEMBER_EXISTS");

    const membership = await transaction.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId,
        roleId: invitation.roleId,
      },
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        role: { select: { id: true, name: true, slug: true } },
      },
    });
    await transaction.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    return membership;
  });
}

export async function listRoles(workspaceId: string) {
  const roles = await prisma.role.findMany({
    where: { workspaceId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isSystem: true,
      permissions: { select: { permission: { select: { key: true, description: true } } } },
      _count: { select: { memberships: true } },
    },
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    memberCount: role._count.memberships,
    permissions: role.permissions.map(({ permission }) => permission.key),
  }));
}

export function listPermissionCatalog() {
  return permissionDefinitions;
}

export async function createRole(workspaceId: string, input: CreateRoleInput) {
  const allowedKeys = new Set(permissionDefinitions.map(({ key }) => key));
  if (input.permissions.some((permission) => !allowedKeys.has(permission as never))) {
    throw new AppError(422, "One or more permissions are invalid", "PERMISSION_INVALID");
  }
  const slug = toSlug(input.name);
  if (!slug) throw new AppError(422, "Role name cannot be converted to a valid slug", "ROLE_NAME_INVALID");
  const existing = await prisma.role.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } });
  if (existing) throw new AppError(409, "A role with this name already exists", "ROLE_EXISTS");

  return prisma.role.create({
    data: {
      workspaceId,
      name: input.name,
      slug,
      description: input.description,
      permissions: {
        create: input.permissions.map((key) => ({ permission: { connect: { key } } })),
      },
    },
    include: { permissions: { include: { permission: true } } },
  });
}

export async function updateRole(workspaceId: string, roleId: string, input: UpdateRoleInput) {
  const role = await prisma.role.findFirst({ where: { id: roleId, workspaceId } });
  if (!role) throw new AppError(404, "Role was not found", "ROLE_NOT_FOUND");
  if (role.slug === "owner") throw new AppError(400, "The Owner role cannot be modified", "OWNER_ROLE_IMMUTABLE");
  if (role.isSystem && (input.name !== undefined || input.description !== undefined)) {
    throw new AppError(400, "Built-in role names cannot be modified", "SYSTEM_ROLE_IDENTITY_IMMUTABLE");
  }

  const nextSlug = input.name ? toSlug(input.name) : role.slug;
  return prisma.$transaction(async (transaction) => {
    if (input.permissions) {
      await transaction.rolePermission.deleteMany({ where: { roleId } });
      const permissions = await transaction.permission.findMany({ where: { key: { in: input.permissions } } });
      if (permissions.length !== new Set(input.permissions).size) {
        throw new AppError(422, "One or more permissions are invalid", "PERMISSION_INVALID");
      }
      await transaction.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      });
    }
    return transaction.role.update({
      where: { id: roleId },
      data: { name: input.name, slug: nextSlug, description: input.description },
      include: { permissions: { include: { permission: true } } },
    });
  });
}

export async function deleteRole(workspaceId: string, roleId: string): Promise<void> {
  const role = await prisma.role.findFirst({
    where: { id: roleId, workspaceId },
    include: { _count: { select: { memberships: true, invitations: true } } },
  });
  if (!role) throw new AppError(404, "Role was not found", "ROLE_NOT_FOUND");
  if (role.isSystem) throw new AppError(400, "Built-in roles cannot be deleted", "SYSTEM_ROLE_IMMUTABLE");
  if (role._count.memberships > 0 || role._count.invitations > 0) {
    throw new AppError(409, "Reassign members and invitations before deleting this role", "ROLE_IN_USE");
  }
  await prisma.role.delete({ where: { id: roleId } });
}

export async function changeMemberRole(
  workspaceId: string,
  actorUserId: string,
  membershipId: string,
  roleId: string,
) {
  const [workspace, membership, role] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findFirst({ where: { id: membershipId, workspaceId } }),
    prisma.role.findFirst({ where: { id: roleId, workspaceId } }),
  ]);
  if (!workspace || !membership) throw new AppError(404, "Workspace member was not found", "MEMBER_NOT_FOUND");
  if (!role) throw new AppError(400, "The selected role does not belong to this workspace", "ROLE_INVALID");
  if (membership.userId === workspace.ownerId || role.slug === "owner") {
    throw new AppError(400, "Workspace ownership cannot be changed through member roles", "OWNER_ROLE_RESERVED");
  }
  if (membership.userId === actorUserId) {
    throw new AppError(400, "You cannot change your own role", "SELF_ROLE_CHANGE_DENIED");
  }
  return prisma.workspaceMember.update({
    where: { id: membershipId },
    data: { roleId },
    include: { role: { select: { id: true, name: true, slug: true } } },
  });
}

export async function changeMemberStatus(
  workspaceId: string,
  actorUserId: string,
  membershipId: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  const [workspace, membership] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findFirst({ where: { id: membershipId, workspaceId }, include: { role: { select: { slug: true } } } }),
  ]);
  if (!workspace || !membership) throw new AppError(404, "Workspace member was not found", "MEMBER_NOT_FOUND");
  if (membership.userId === workspace.ownerId || membership.role.slug === "owner") {
    throw new AppError(400, "The workspace owner cannot be suspended", "OWNER_SUSPENSION_DENIED");
  }
  if (membership.userId === actorUserId) {
    throw new AppError(400, "You cannot change your own membership status", "SELF_STATUS_CHANGE_DENIED");
  }

  return prisma.workspaceMember.update({
    where: { id: membershipId },
    data: { status },
    select: { id: true, status: true, updatedAt: true },
  });
}

export async function removeMember(
  workspaceId: string,
  actorUserId: string,
  membershipId: string,
): Promise<void> {
  const [workspace, membership] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findFirst({ where: { id: membershipId, workspaceId } }),
  ]);
  if (!workspace || !membership) throw new AppError(404, "Workspace member was not found", "MEMBER_NOT_FOUND");
  if (membership.userId === workspace.ownerId) {
    throw new AppError(400, "The workspace owner cannot be removed", "OWNER_REMOVAL_DENIED");
  }
  if (membership.userId === actorUserId) {
    throw new AppError(400, "Use the leave workspace flow to remove yourself", "SELF_REMOVAL_DENIED");
  }
  await prisma.workspaceMember.delete({ where: { id: membershipId } });
}
