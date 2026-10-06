import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AdminListQuery, AdminPlanRequestDecision, AdminPlanRequestQuery } from "./admin.schemas.js";

function pagination(total: number, query: AdminListQuery) {
  return { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 };
}

function addBillingPeriod(date: Date, billingPeriod: "MONTHLY" | "ANNUAL") {
  const result = new Date(date);
  if (billingPeriod === "ANNUAL") {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
    return result;
  }
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export async function listPlanRequests(query: AdminPlanRequestQuery) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { OR: [
      { planName: { contains: query.search, mode: "insensitive" as const } },
      { workspace: { name: { contains: query.search, mode: "insensitive" as const } } },
      { workspace: { slug: { contains: query.search, mode: "insensitive" as const } } },
      { requestedBy: { email: { contains: query.search, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const [total, records] = await Promise.all([
    prisma.planRequest.count({ where }),
    prisma.planRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: {
      workspace: { select: { id: true, name: true, slug: true } },
      requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      reviewedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      subscription: { select: { id: true, status: true } },
    } }),
  ]);
  return { items: records.map((record) => ({ ...record, amountMinorUnits: record.amountMinorUnits.toString(), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(), decidedAt: record.decidedAt?.toISOString() ?? null })), pagination: pagination(total, query) };
}

export async function decidePlanRequest(requestId: string, actorUserId: string, input: AdminPlanRequestDecision) {
  return prisma.$transaction(async (transaction) => {
    const request = await transaction.planRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError(404, "Plan request was not found", "PLAN_REQUEST_NOT_FOUND");
    if (request.status !== "PENDING") throw new AppError(409, "This plan request has already been reviewed", "PLAN_REQUEST_ALREADY_REVIEWED");

    let subscriptionId: string | null = null;
    let subscriptionStatus: "ACTIVE" | "TRIALING" | null = null;
    if (input.decision === "APPROVE") {
      const active = await transaction.workspaceSubscription.findFirst({ where: { workspaceId: request.workspaceId, status: { in: ["ACTIVE", "TRIALING"] } }, select: { id: true } });
      if (active) throw new AppError(409, "This workspace already has an active subscription", "ACTIVE_SUBSCRIPTION_EXISTS");
      const startedAt = new Date();
      const trialEndsAt = request.trialDays > 0 ? new Date(startedAt.getTime() + request.trialDays * 24 * 60 * 60 * 1000) : null;
      const periodStartsAt = trialEndsAt ?? startedAt;
      subscriptionStatus = trialEndsAt ? "TRIALING" : "ACTIVE";
      const subscription = await transaction.workspaceSubscription.create({ data: {
        workspaceId: request.workspaceId,
        planId: request.planId,
        planName: request.planName,
        status: subscriptionStatus,
        billingPeriod: request.billingPeriod,
        currency: request.currency,
        amountMinorUnits: request.amountMinorUnits,
        startedAt,
        trialEndsAt,
        currentPeriodStartsAt: periodStartsAt,
        currentPeriodEndsAt: addBillingPeriod(periodStartsAt, request.billingPeriod),
      } });
      subscriptionId = subscription.id;
    }

    const updated = await transaction.planRequest.update({ where: { id: request.id }, data: {
      status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedByUserId: actorUserId,
      decidedAt: new Date(),
      adminNote: input.adminNote ?? null,
      subscriptionId,
    } });
    await transaction.platformAuditLog.create({ data: {
      actorUserId,
      action: input.decision === "APPROVE" ? "PLAN_REQUEST_APPROVED" : "PLAN_REQUEST_REJECTED",
      resourceType: "plan_request",
      resourceId: request.id,
      workspaceId: request.workspaceId,
      metadata: { planName: request.planName, billingPeriod: request.billingPeriod, amountMinorUnits: request.amountMinorUnits.toString(), subscriptionId, subscriptionStatus, adminNote: input.adminNote ?? null },
    } });
    return { id: updated.id, status: updated.status, subscriptionId, subscriptionStatus, decidedAt: updated.decidedAt?.toISOString() ?? null };
  });
}
