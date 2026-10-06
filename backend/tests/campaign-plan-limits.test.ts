import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/middleware/error-handler.js";
import { enforceCampaignPlanLimit, utcMonthRange } from "../src/modules/campaigns/campaign-plan-limits.js";

const plan = { id: "plan-1", slug: "growth", name: "Growth", maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 3, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true };

function fakeTransaction({ status = "ACTIVE", trialEndsAt = null, currentCampaigns = 2, subscriptionExists = true, planLimit = 3 } = {}) {
  let countQuery: any;
  const transaction = {
    $queryRaw: async () => [],
    workspaceSubscription: {
      findFirst: async () => subscriptionExists ? { id: "subscription-1", status, trialEndsAt, plan: { ...plan, maxCampaignsPerMonth: planLimit } } : null,
      updateMany: async () => ({ count: 1 }),
    },
    campaign: { count: async (query: any) => { countQuery = query; return currentCampaigns; } },
  };
  return { transaction: transaction as never, getCountQuery: () => countQuery };
}

const now = new Date("2026-10-05T12:00:00.000Z");

test("allows a launch when the current UTC month is below the plan cap", async () => {
  const fake = fakeTransaction({ currentCampaigns: 2 });
  await enforceCampaignPlanLimit(fake.transaction, "workspace-1", now, now);
  assert.deepEqual(fake.getCountQuery().where.OR, [
    { status: "SCHEDULED", scheduledAt: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") } },
    { setLiveAt: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-11-01T00:00:00.000Z") } },
  ]);
});

test("rejects a launch that would exceed the monthly campaign limit", async () => {
  const fake = fakeTransaction({ currentCampaigns: 3 });
  await assert.rejects(
    enforceCampaignPlanLimit(fake.transaction, "workspace-1", now, now),
    (error: unknown) => error instanceof AppError && error.code === "PLAN_LIMIT_REACHED" && (error.details as { feature: string }).feature === "campaignsPerMonth",
  );
});

test("uses the scheduled launch month when a campaign is scheduled ahead", async () => {
  const scheduledAt = new Date("2027-01-18T08:30:00.000Z");
  const fake = fakeTransaction({ currentCampaigns: 0 });
  await enforceCampaignPlanLimit(fake.transaction, "workspace-1", scheduledAt, now);
  assert.deepEqual(fake.getCountQuery().where.OR[0], { status: "SCHEDULED", scheduledAt: { gte: new Date("2027-01-01T00:00:00.000Z"), lt: new Date("2027-02-01T00:00:00.000Z") } });
});

test("blocks campaign launches after a trial expires", async () => {
  const fake = fakeTransaction({ status: "TRIALING", trialEndsAt: new Date("2026-10-05T11:59:59.000Z") });
  await assert.rejects(
    enforceCampaignPlanLimit(fake.transaction, "workspace-1", now, now),
    (error: unknown) => error instanceof AppError && error.code === "TRIAL_EXPIRED",
  );
  assert.equal(fake.getCountQuery(), undefined);
});

test("keeps legacy workspaces without a subscription unrestricted", async () => {
  const fake = fakeTransaction({ subscriptionExists: false, currentCampaigns: 100 });
  await enforceCampaignPlanLimit(fake.transaction, "workspace-1", now, now);
  assert.equal(fake.getCountQuery(), undefined);
});

test("calculates UTC month boundaries across year end", () => {
  assert.deepEqual(utcMonthRange(new Date("2026-12-31T23:59:59.000Z")), { start: new Date("2026-12-01T00:00:00.000Z"), end: new Date("2027-01-01T00:00:00.000Z") });
});
