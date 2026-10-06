import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error-handler.js";
import { resolveWorkspaceEntitlements } from "../billing/entitlements.service.js";

export async function enforceContactPlanLimit(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  requestedContacts: number,
  now = new Date(),
) {
  // Serialize contact additions for a workspace so concurrent creates cannot race past the cap.
  await transaction.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;

  const entitlements = await resolveWorkspaceEntitlements(workspaceId, now, transaction);
  if (entitlements.status === "EXPIRED") {
    throw new AppError(403, "Your free trial has ended. Choose a plan to add or update contacts.", "TRIAL_EXPIRED");
  }
  if (requestedContacts === 0 || entitlements.plan?.maxContacts == null) return;

  const currentContacts = await transaction.contact.count({ where: { workspaceId, deletedAt: null } });
  const limit = entitlements.plan.maxContacts;
  if (currentContacts + requestedContacts > limit) {
    throw new AppError(403, "This action would exceed your plan's contact limit.", "PLAN_LIMIT_REACHED", {
      feature: "contacts",
      limit,
      current: currentContacts,
      requested: requestedContacts,
    });
  }
}
