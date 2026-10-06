import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";

const entitlementsPlanSelect = {
  id: true,
  slug: true,
  name: true,
  maxSeats: true,
  maxContacts: true,
  maxCampaignsPerMonth: true,
  maxAutomations: true,
  maxWorkflows: true,
  maxPipelines: true,
  apiAccess: true,
  webhooks: true,
  advancedReports: true,
} as const;

export type WorkspacePlanEntitlements = {
  id: string;
  slug: string;
  name: string;
  maxSeats: number | null;
  maxContacts: number | null;
  maxCampaignsPerMonth: number | null;
  maxAutomations: number | null;
  maxWorkflows: number | null;
  maxPipelines: number | null;
  apiAccess: boolean;
  webhooks: boolean;
  advancedReports: boolean;
};

export type WorkspaceEntitlements = {
  status: "NONE" | "ACTIVE" | "TRIALING" | "EXPIRED";
  subscriptionId: string | null;
  plan: WorkspacePlanEntitlements | null;
  trialEndsAt: Date | null;
};

type EntitlementDatabase = Pick<typeof prisma, "workspaceSubscription">;

export type PlanFeature = "apiAccess" | "webhooks" | "advancedReports";

export async function resolveWorkspaceEntitlements(
  workspaceId: string,
  now = new Date(),
  database: EntitlementDatabase = prisma,
): Promise<WorkspaceEntitlements> {
  const subscription = await database.workspaceSubscription.findFirst({
    where: { workspaceId, status: { in: ["ACTIVE", "TRIALING"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { plan: { select: entitlementsPlanSelect } },
  });

  if (!subscription) {
    const expiredSubscription = await database.workspaceSubscription.findFirst({
      where: { workspaceId, status: "EXPIRED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, trialEndsAt: true },
    });
    if (!expiredSubscription) return { status: "NONE", subscriptionId: null, plan: null, trialEndsAt: null };
    return { status: "EXPIRED", subscriptionId: expiredSubscription.id, plan: null, trialEndsAt: expiredSubscription.trialEndsAt };
  }

  if (subscription.status === "TRIALING" && (!subscription.trialEndsAt || subscription.trialEndsAt <= now)) {
    await database.workspaceSubscription.updateMany({
      where: { id: subscription.id, status: "TRIALING", trialEndsAt: subscription.trialEndsAt },
      data: { status: "EXPIRED", endedAt: now },
    });
    return { status: "EXPIRED", subscriptionId: subscription.id, plan: null, trialEndsAt: subscription.trialEndsAt };
  }

  return {
    status: subscription.status === "TRIALING" ? "TRIALING" : "ACTIVE",
    subscriptionId: subscription.id,
    plan: subscription.plan,
    trialEndsAt: subscription.trialEndsAt,
  };
}

export async function assertWorkspaceFeatureEnabled(
  workspaceId: string,
  feature: PlanFeature,
  database: EntitlementDatabase = prisma,
  now = new Date(),
) {
  const entitlements = await resolveWorkspaceEntitlements(workspaceId, now, database);
  if (entitlements.status === "NONE") return;
  if (entitlements.status === "EXPIRED") {
    throw new AppError(403, "Your free trial has ended. Choose a plan to continue using this feature.", "TRIAL_EXPIRED", { feature });
  }
  if (!entitlements.plan?.[feature]) {
    throw new AppError(403, "This feature is not included in your current plan.", "PLAN_FEATURE_NOT_INCLUDED", { feature });
  }
}

export async function assertWorkspaceWritable(workspaceId: string, now = new Date(), database: EntitlementDatabase = prisma) {
  const entitlements = await resolveWorkspaceEntitlements(workspaceId, now, database);
  if (entitlements.status === "EXPIRED") {
    throw new AppError(403, "Your free trial has ended. This workspace is read-only. Choose a plan to make changes again.", "TRIAL_EXPIRED", { readOnly: true });
  }
}
