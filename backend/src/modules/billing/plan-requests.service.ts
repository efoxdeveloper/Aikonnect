import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { PlanRequestCreate } from "./plan-requests.schemas.js";

function serializeRequest(request: Awaited<ReturnType<typeof prisma.planRequest.findFirstOrThrow>>) {
  return { ...request, amountMinorUnits: request.amountMinorUnits.toString(), createdAt: request.createdAt.toISOString(), decidedAt: request.decidedAt?.toISOString() ?? null };
}

export async function createWorkspacePlanRequest(workspaceId: string, requestedByUserId: string, input: PlanRequestCreate) {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: input.planId, active: true } });
  if (!plan) throw new AppError(404, "This plan is no longer available", "PLAN_NOT_AVAILABLE");
  const amountMinorUnits = input.billingPeriod === "MONTHLY" ? plan.monthlyPriceMinorUnits : plan.annualPriceMinorUnits;
  if (amountMinorUnits <= 0n) throw new AppError(422, "This billing period is not available for the selected plan", "PLAN_BILLING_PERIOD_UNAVAILABLE");

  const [activeSubscription, pendingRequest] = await Promise.all([
    prisma.workspaceSubscription.findFirst({ where: { workspaceId, status: { in: ["ACTIVE", "TRIALING"] } }, select: { id: true } }),
    prisma.planRequest.findFirst({ where: { workspaceId, status: "PENDING" } }),
  ]);
  if (activeSubscription) throw new AppError(409, "This workspace already has an active subscription", "ACTIVE_SUBSCRIPTION_EXISTS");
  if (pendingRequest) {
    if (pendingRequest.planId === plan.id && pendingRequest.billingPeriod === input.billingPeriod) return serializeRequest(pendingRequest);
    throw new AppError(409, "A plan request is already awaiting review", "PLAN_REQUEST_ALREADY_PENDING");
  }

  const request = await prisma.planRequest.create({ data: {
    workspaceId,
    planId: plan.id,
    requestedByUserId,
    planName: plan.name,
    billingPeriod: input.billingPeriod,
    currency: plan.currency,
    amountMinorUnits,
    trialDays: plan.trialDays,
    customerNote: input.customerNote ?? null,
  } });
  return serializeRequest(request);
}

export async function listWorkspacePlanRequests(workspaceId: string) {
  const items = await prisma.planRequest.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return { items: items.map(serializeRequest) };
}
