import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error-handler.js";
import { resolveWorkspaceEntitlements } from "../billing/entitlements.service.js";

export function utcMonthRange(value: Date) {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function enforceCampaignPlanLimit(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  launchAt: Date,
  now = new Date(),
) {
  // Serialize launches in this workspace so simultaneous requests cannot exceed the monthly cap.
  await transaction.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;

  const entitlements = await resolveWorkspaceEntitlements(workspaceId, now, transaction);
  if (entitlements.status === "EXPIRED") {
    throw new AppError(403, "Your free trial has ended. Choose a plan to launch campaigns.", "TRIAL_EXPIRED");
  }
  const limit = entitlements.plan?.maxCampaignsPerMonth;
  if (limit == null) return;

  const { start, end } = utcMonthRange(launchAt);
  const currentCampaigns = await transaction.campaign.count({
    where: {
      workspaceId,
      OR: [
        { status: "SCHEDULED", scheduledAt: { gte: start, lt: end } },
        { setLiveAt: { gte: start, lt: end } },
      ],
    },
  });
  if (currentCampaigns + 1 > limit) {
    throw new AppError(403, "This action would exceed your plan's monthly campaign limit.", "PLAN_LIMIT_REACHED", {
      feature: "campaignsPerMonth",
      limit,
      current: currentCampaigns,
      requested: 1,
      month: start.toISOString().slice(0, 7),
    });
  }
}
