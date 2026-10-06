import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error-handler.js";
import { resolveWorkspaceEntitlements } from "../billing/entitlements.service.js";

export async function enforceWorkspaceSeatLimit(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  additionalSeats = 0,
  now = new Date(),
) {
  // Serialize invite and acceptance operations for this workspace to avoid overbooking seats.
  await transaction.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;

  const entitlements = await resolveWorkspaceEntitlements(workspaceId, now, transaction);
  if (entitlements.status === "EXPIRED") {
    throw new AppError(403, "Your free trial has ended. Choose a plan to invite or add team members.", "TRIAL_EXPIRED");
  }
  const limit = entitlements.plan?.maxSeats;
  if (limit == null) return;

  const [activeMembers, pendingInvitations] = await Promise.all([
    transaction.workspaceMember.count({ where: { workspaceId, status: "ACTIVE" } }),
    transaction.workspaceInvitation.count({ where: { workspaceId, status: "PENDING", expiresAt: { gt: now } } }),
  ]);
  if (activeMembers + pendingInvitations + additionalSeats > limit) {
    throw new AppError(403, "This action would exceed your plan's team seat limit.", "PLAN_LIMIT_REACHED", {
      feature: "seats",
      limit,
      current: activeMembers + pendingInvitations,
      requested: additionalSeats,
    });
  }
}
