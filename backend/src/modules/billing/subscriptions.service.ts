import { prisma } from "../../database/prisma.js";
import { resolveWorkspaceEntitlements } from "./entitlements.service.js";

export async function listWorkspaceSubscriptions(workspaceId: string) {
  const entitlements = await resolveWorkspaceEntitlements(workspaceId);
  const [subscriptions, requests] = await Promise.all([
    prisma.workspaceSubscription.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { plan: { select: { slug: true } } } }),
    prisma.planRequest.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
  ]);
  const items = subscriptions.map((subscription) => ({
    id: subscription.id,
    planId: subscription.planId,
    planName: subscription.planName,
    planSlug: subscription.plan?.slug ?? null,
    status: subscription.status,
    billingPeriod: subscription.billingPeriod,
    currency: subscription.currency,
    amountMinorUnits: subscription.amountMinorUnits.toString(),
    startedAt: subscription.startedAt?.toISOString() ?? null,
    trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
    currentPeriodStartsAt: subscription.currentPeriodStartsAt?.toISOString() ?? null,
    currentPeriodEndsAt: subscription.currentPeriodEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt?.toISOString() ?? null,
    endedAt: subscription.endedAt?.toISOString() ?? null,
    createdAt: subscription.createdAt.toISOString(),
  }));
  return { active: entitlements.subscriptionId ? items.find((item) => item.id === entitlements.subscriptionId) ?? null : null, items, requests: requests.map((request) => ({ id: request.id, planName: request.planName, billingPeriod: request.billingPeriod, currency: request.currency, amountMinorUnits: request.amountMinorUnits.toString(), trialDays: request.trialDays, status: request.status, adminNote: request.adminNote, createdAt: request.createdAt.toISOString(), decidedAt: request.decidedAt?.toISOString() ?? null })) };
}
